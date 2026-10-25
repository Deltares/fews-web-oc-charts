// Full sync/live acceptance scenario for examples/v5-live-stream/ (PLAN-v5 Phase 4, step 6).
// Dependency-free so it can run under any Playwright page; scripts/phase4-live-stream.mjs
// supplies the server, browser and output.
const MiB = 1024 * 1024
export const budgets = {
  pixelTolerance: 1,
  plateauGrowthBytes: MiB,
  plateauSpreadBytes: 2 * MiB,
  plateauNodeSpread: 64,
  recreateGrowthBytes: MiB,
  recreateCycles: 20,
}

function check(condition, message) {
  if (!condition) throw new Error(`Live-stream acceptance: ${message}`)
}

function near(actual, expected, tolerance, message) {
  check(
    Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
    `${message}: expected ${expected} ± ${tolerance}, got ${actual}`,
  )
}

export async function runLiveStreamScenario(page, { baseUrl, log = () => {} }) {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const tall = { width: 1280, height: 1200 }
  await page.setViewportSize(tall)
  await page.goto(`${baseUrl}/examples/v5-live-stream/`)
  await page.waitForFunction(() => !!window.liveStream)
  await page.evaluate(() => import('/scripts/phase4-live-stream-probe.ts'))
  await page.waitForFunction(() => !!window.liveProbe)
  await page.evaluate(() => document.fonts.ready)
  const both = ['stacked', 'grouped']
  const call = (name, ...args) =>
    page.evaluate(([method, params]) => window.liveProbe[method](...params), [name, args])
  const frame = () => call('frame')
  // Native IntersectionObserver results, not a manual resume, drive these transitions.
  const visible = (name, value = true) =>
    page.waitForFunction(
      ([plot, expected]) => {
        const current = plot === 'overview' ? window.liveStream.overview : window.liveStream.detail
        return !!current && !current.destroyed && current.paused === !expected
      },
      [name, value],
    )
  async function drag(from, to, key) {
    await page.mouse.move(from.x, from.y)
    if (key) await page.keyboard.down(key)
    try {
      await page.mouse.down()
      await page.mouse.move(to.x, to.y, { steps: 10 })
      await page.mouse.up()
    } finally {
      if (key) await page.keyboard.up(key)
    }
    await frame()
  }
  async function leave() {
    await page.mouse.move(2, 2)
    await frame()
  }
  async function expectFollowing(message) {
    const state = await call('follow')
    check(state.following, `${message}: follow should be active`)
    check(
      state.domain[0] === state.window[0] && state.domain[1] === state.window[1],
      `${message}: domain ${state.domain} is not the latest window ${state.window}`,
    )
    return state
  }
  async function expectGuides(names, message) {
    for (const name of names) {
      const guide = await call('crosshair', name)
      check(guide.visible, `${message}: ${name} crosshair hidden`)
      near(guide.x, guide.expectedX, budgets.pixelTolerance, `${message}: ${name} x guide`)
      near(guide.y, guide.expectedY, budgets.pixelTolerance, `${message}: ${name} y guide`)
    }
  }
  async function expectBrush(names, message) {
    for (const name of names) {
      const brush = await call('brush', name)
      check(brush.expected && brush.visible, `${message}: ${name} brush hidden`)
      near(brush.x, brush.expected.x, budgets.pixelTolerance, `${message}: ${name} brush x`)
      near(brush.width, brush.expected.width, budgets.pixelTolerance, `${message}: ${name} width`)
    }
  }
  async function expectLevelEnd(name, message) {
    const end = await call('levelEnd', name)
    near(end.x, end.expected, budgets.pixelTolerance, `${message}: ${name} latest sample`)
  }
  async function timeTolerance(name) {
    const left = await call('client', name, 0, 0.5)
    const right = await call('client', name, 1, 0.5)
    const [a, b] = await Promise.all([call('invert', name, left.x), call('invert', name, right.x)])
    return (2 * Math.abs(b - a)) / (right.x - left.x)
  }
  async function expectRange(name, from, to, message) {
    const brush = await call('brush', 'overview')
    const tolerance = await timeTolerance(name)
    near(brush.range[0], await call('invert', name, from.x), tolerance, `${message} start`)
    near(brush.range[1], await call('invert', name, to.x), tolerance, `${message} end`)
    return brush.range
  }
  const results = {}

  // 1. Initial follow window, retained rows/IDs/endpoints and incremental stack work.
  await visible('overview')
  await visible('detail')
  await frame()
  await expectFollowing('Initial state')
  results.initial = await call('advance', 2, both)
  await expectFollowing('After appends')
  await expectLevelEnd('overview', 'After appends')
  await expectLevelEnd('detail', 'After appends')
  log('initial follow, retention and tail-only stack work passed')

  // 2. Shared pointer: destination projections, stationary reprojection, no echo, leave.
  const overviewPoint = await call('client', 'overview', 0.5, 0.35)
  await page.mouse.move(overviewPoint.x, overviewPoint.y)
  await frame()
  let pointer = await call('pointer')
  check(pointer.active && pointer.values.length === 2, 'Overview hover did not share t and q.')
  await expectGuides(['overview', 'detail'], 'Overview hover')
  const sourceGuide = await call('crosshair', 'overview')
  const peerGuide = await call('crosshair', 'detail')
  check(
    Math.abs(sourceGuide.x - peerGuide.x) > 5,
    'Peer guide copied source pixels instead of projecting the shared value.',
  )
  await call('advance', 1, both)
  await expectGuides(['overview', 'detail'], 'Stationary pointer after a follow append')
  const moved = await call('crosshair', 'detail')
  check(Math.abs(moved.x - peerGuide.x) > 1, 'Stationary guide did not reproject after follow.')
  check(
    (await call('pointer')).version === pointer.version,
    'A domain change republished the stationary shared pointer.',
  )
  const detailPoint = await call('client', 'detail', 0.25, 0.6)
  await page.mouse.move(detailPoint.x, detailPoint.y)
  await frame()
  const fromDetail = await call('pointer')
  check(fromDetail.version !== pointer.version, 'Detail hover did not publish a new value.')
  await expectGuides(['overview', 'detail'], 'Detail hover')
  await leave()
  pointer = await call('pointer')
  check(!pointer.active, 'Leaving both plots did not deactivate the shared pointer.')
  for (const name of ['overview', 'detail']) {
    check(!(await call('crosshair', name)).visible, `Leaving left the ${name} crosshair visible.`)
  }
  log('shared pointer passed')

  // 3. Shared selection: both directions, reprojection while following, clear.
  let from = await call('client', 'detail', 0.3, 0.5)
  let to = await call('client', 'detail', 0.6, 0.5)
  await drag(from, to, 'Shift')
  await expectFollowing('Shift-drag selection must not pan')
  let range = await expectRange('detail', from, to, 'Detail selection')
  await expectBrush(['overview', 'detail'], 'Detail selection')
  const before = await call('brush', 'overview')
  check(
    Math.abs(before.width - (await call('brush', 'detail')).width) > 5,
    'Selections were not projected through each plot width.',
  )
  await call('advance', 1, both)
  const after = await call('brush', 'overview')
  check(
    after.range[0] === range[0] && after.range[1] === range[1],
    'Appending changed the selection.',
  )
  check(after.x < before.x - 1, 'The selection did not reproject after the follow window moved.')
  await expectBrush(['overview', 'detail'], 'Selection after append')
  from = await call('client', 'overview', 0.7, 0.5)
  to = await call('client', 'overview', 0.9, 0.5)
  await drag(from, to, 'Shift')
  await expectRange('overview', from, to, 'Overview selection')
  await expectBrush(['overview', 'detail'], 'Overview selection')
  await page.locator('#clear-selection').click()
  await frame()
  for (const name of ['overview', 'detail']) {
    const brush = await call('brush', name)
    check(!brush.visible && !brush.range, `Clear left a ${name} selection.`)
  }
  log('shared selection passed')

  // 4. Follow suspension by zoom/pan in either plot, data still arriving, reset/resume.
  const detailCenter = await call('client', 'detail', 0.5, 0.5)
  await page.mouse.move(detailCenter.x, detailCenter.y)
  await page.mouse.wheel(0, -240)
  await frame()
  let state = await call('follow')
  check(!state.following, 'Detail wheel zoom did not suspend follow.')
  const zoomed = state.domain
  const arrived = (await call('accounting')).next
  const rows = await call('advance', 3, both)
  check(rows.next === arrived + 12, 'Data stopped while follow was paused.')
  state = await call('follow')
  check(state.domain[0] === zoomed[0] && state.domain[1] === zoomed[1], 'Suspended follow moved.')
  const overviewCenter = await call('client', 'overview', 0.5, 0.5)
  await page.mouse.dblclick(overviewCenter.x, overviewCenter.y)
  await frame()
  await expectFollowing('Overview double-click reset')
  await drag(await call('client', 'overview', 0.6, 0.5), await call('client', 'overview', 0.4, 0.5))
  state = await call('follow')
  check(!state.following, 'Overview pan did not suspend follow.')
  const panned = state.domain
  await call('advance', 2, both)
  state = await call('follow')
  check(state.domain[0] === panned[0] && state.domain[1] === panned[1], 'Panned follow moved.')
  check((await page.locator('#follow').textContent()) === 'Resume follow', 'Follow button label.')
  await page.locator('#follow').click()
  await frame()
  await expectFollowing('Resume follow button')
  await leave()
  log('follow suspension and reset passed')

  // 5. Off-screen and manual pause: no DOM writes, peers/subscriptions continue, one catch-up.
  const detailBox = await page.locator('#detail').boundingBox()
  const overviewBox = await page.locator('#overview').boundingBox()
  const short = { width: tall.width, height: Math.floor(detailBox.y) - 16 }
  check(overviewBox.y + 100 < short.height, 'The overview must stay visible.')
  await page.setViewportSize(short)
  await visible('detail', false)
  check(!(await call('paused', 'overview')), 'The visible overview paused.')
  async function suspended(label, batches) {
    await page.evaluate(() => {
      window.liveWatch = {
        detail: window.liveProbe.watch('#detail'),
        overview: window.liveProbe.watch('#overview'),
        domains: window.liveProbe.countDomains(),
      }
    })
    await call('advance', batches, ['stacked'])
    const writes = await page.evaluate(() => ({
      detail: window.liveWatch.detail.read(),
      overview: window.liveWatch.overview.stop(),
      domains: window.liveWatch.domains.stop(),
    }))
    check(writes.detail.records === 0, `${label}: the suspended detail wrote to the DOM.`)
    check(writes.overview.records > 0, `${label}: the visible overview stopped rendering.`)
    check(writes.domains === batches, `${label}: expected ${batches} domain notifications.`)
    await expectFollowing(label)
    await expectLevelEnd('overview', label)
    return writes
  }
  async function caughtUp(label) {
    for (let count = 0; count < 3; count += 1) await frame()
    const writes = await page.evaluate(() => window.liveWatch.detail.stop())
    check(writes.records > 0, `${label}: the detail did not catch up.`)
    check(writes.frames === 1, `${label}: expected one catch-up frame, got ${writes.frames}.`)
    await expectLevelEnd('detail', label)
    return writes
  }
  results.offscreen = await suspended('Off-screen detail', 6)
  await page.setViewportSize(tall)
  await visible('detail')
  results.offscreen.catchUp = await caughtUp('Off-screen detail')
  await page.locator('#pause-detail').click()
  check(await call('paused', 'detail'), 'Manual pause did not suspend the detail.')
  results.manual = await suspended('Manually paused detail', 4)
  await page.locator('#pause-detail').click()
  await visible('detail')
  results.manual.catchUp = await caughtUp('Manually paused detail')
  log('off-screen and manual pause passed')

  // 6. Destroy/recreate: survivors keep data, follow, pointer and selection.
  from = await call('client', 'overview', 0.2, 0.5)
  to = await call('client', 'overview', 0.4, 0.5)
  await drag(from, to, 'Shift')
  range = await expectRange('overview', from, to, 'Selection before destroy')
  await leave()
  await page.locator('#toggle-detail').click()
  check(!(await call('mounted')), 'The detail was not destroyed.')
  check(
    (await page.locator('#detail').evaluate((host) => host.childElementCount)) === 0,
    'Destroy left detail DOM behind.',
  )
  await call('advance', 4, ['stacked'])
  await expectFollowing('After destroying the detail')
  await expectLevelEnd('overview', 'After destroying the detail')
  check(
    (await call('brush', 'overview')).range?.[0] === range[0],
    'Destroying a consumer cleared the shared selection.',
  )
  await page.mouse.move(overviewPoint.x, overviewPoint.y)
  await frame()
  check((await call('pointer')).active, 'The survivor no longer publishes the pointer.')
  await leave()
  await page.locator('#toggle-detail').click()
  await visible('detail')
  await frame()
  await expectBrush(['overview', 'detail'], 'Recreated detail selection')
  await expectLevelEnd('detail', 'Recreated detail')
  const recreatedPoint = await call('client', 'detail', 0.7, 0.4)
  await page.mouse.move(recreatedPoint.x, recreatedPoint.y)
  await frame()
  await expectGuides(['overview', 'detail'], 'Recreated detail hover')
  await leave()
  await call('advance', 2, both)
  log('destroy/recreate passed')

  // 7. Resources: repeated destroy/recreate and a post-warmup live plateau.
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('HeapProfiler.enable')
  async function measure() {
    await cdp.send('HeapProfiler.collectGarbage')
    const usage = await cdp.send('Runtime.getHeapUsage')
    check(Number.isFinite(usage.backingStorageSize), 'CDP did not report backing-store memory.')
    return {
      heapBytes: usage.usedSize,
      backingBytes: usage.backingStorageSize,
      totalBytes: usage.usedSize + usage.backingStorageSize,
    }
  }
  async function cycle() {
    await page.locator('#toggle-detail').click()
    await page.locator('#toggle-detail').click()
    await visible('detail')
    await frame()
  }
  await cycle()
  const cycleStart = { memory: await measure(), accounting: await call('accounting') }
  for (let count = 0; count < budgets.recreateCycles; count += 1) await cycle()
  const cycleEnd = { memory: await measure(), accounting: await call('accounting') }
  results.recreate = {
    cycles: budgets.recreateCycles,
    growthBytes: cycleEnd.memory.totalBytes - cycleStart.memory.totalBytes,
    start: cycleStart,
    end: cycleEnd,
  }
  check(
    results.recreate.growthBytes <= budgets.recreateGrowthBytes,
    `Destroy/recreate retained ${results.recreate.growthBytes} bytes.`,
  )
  check(
    cycleEnd.accounting.rendering.nodes === cycleStart.accounting.rendering.nodes,
    'Destroy/recreate leaked DOM nodes.',
  )

  await call('advance', 128, both)
  const samples = []
  let accounting
  for (let sample = 0; sample < 6; sample += 1) {
    accounting = await call('advance', 64, both)
    samples.push({ ...(await measure()), nodes: accounting.rendering.nodes })
  }
  const totals = samples.map((sample) => sample.totalBytes)
  const nodes = samples.map((sample) => sample.nodes)
  results.plateau = {
    samples,
    growthBytes: totals.at(-1) - totals[0],
    spreadBytes: Math.max(...totals) - Math.min(...totals),
    nodeSpread: Math.max(...nodes) - Math.min(...nodes),
    accounting,
  }
  check(
    results.plateau.growthBytes <= budgets.plateauGrowthBytes,
    `Post-warmup memory grew by ${results.plateau.growthBytes} bytes.`,
  )
  check(
    results.plateau.spreadBytes <= budgets.plateauSpreadBytes,
    `Post-warmup memory spread ${results.plateau.spreadBytes} bytes.`,
  )
  check(
    results.plateau.nodeSpread <= budgets.plateauNodeSpread,
    `Rendered DOM did not plateau (${results.plateau.nodeSpread} nodes).`,
  )
  results.dom = await cdp.send('Memory.getDOMCounters')
  await expectFollowing('After the plateau')
  log('resource plateau passed')

  check(errors.length === 0, `The page reported errors: ${errors.join('; ')}`)
  return results
}

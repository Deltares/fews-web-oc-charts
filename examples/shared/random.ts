export function exampleRandom() {
  const input = new URLSearchParams(location.search).get('seed')
  let state = input === null ? 123456789 : Number(input)
  if (!Number.isSafeInteger(state) || state < 0 || state > 0xffffffff) {
    throw new Error('The example seed must be an unsigned 32-bit integer.')
  }
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 0x100000000
  }
}

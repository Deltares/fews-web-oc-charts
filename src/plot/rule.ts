import { validateKeys } from '../core/validation.js'

export interface RuleOptions {
  id?: string
  scale: string
  value: number
  stroke?: string
  strokeWidth?: number
}

export interface RuleMark {
  readonly id: string | undefined
  readonly scale: string
  readonly value: number
  readonly stroke: string | undefined
  readonly strokeWidth: number
}

const ruleMarks = new WeakSet<object>()

export function isRuleMark(value: object): value is RuleMark {
  return ruleMarks.has(value)
}

export function rule(options: RuleOptions): RuleMark {
  if (!options || typeof options !== 'object') throw new Error('rule options must be an object.')
  validateKeys(options, ['id', 'scale', 'value', 'stroke', 'strokeWidth'], 'rule')
  if (options.id !== undefined && (typeof options.id !== 'string' || options.id.length === 0)) {
    throw new Error('rule.id must be a non-empty string.')
  }
  if (typeof options.scale !== 'string' || options.scale.length === 0) {
    throw new Error('rule.scale must name a plot scale.')
  }
  if (!Number.isFinite(options.value)) throw new Error('rule.value must be a finite number.')
  if (options.stroke !== undefined && (typeof options.stroke !== 'string' || !options.stroke)) {
    throw new Error('rule.stroke must be a non-empty string.')
  }
  const strokeWidth = options.strokeWidth ?? 1.5
  if (!Number.isFinite(strokeWidth) || strokeWidth <= 0) {
    throw new Error('rule.strokeWidth must be a positive finite number.')
  }
  const mark = Object.freeze({
    id: options.id,
    scale: options.scale,
    value: options.value,
    stroke: options.stroke,
    strokeWidth,
  })
  ruleMarks.add(mark)
  return mark
}

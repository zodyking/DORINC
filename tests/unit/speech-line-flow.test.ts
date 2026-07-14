import { describe, expect, it } from 'vitest'
import {
  parseSpokenAddLineCommand,
  parseSpokenCancel,
  parseSpokenConfirm,
  parseSpokenEditField,
  parseSpokenEditLineNumber,
  parseSpokenLineType,
  parseSpokenNumber,
  parseKeepCurrent,
} from '../../app/utils/speech-line-flow'

describe('speech line flow commands', () => {
  it('detects add line commands', () => {
    expect(parseSpokenAddLineCommand('add a line')).toBe(true)
    expect(parseSpokenAddLineCommand('add another item')).toBe(true)
    expect(parseSpokenAddLineCommand('another line')).toBe(true)
    expect(parseSpokenAddLineCommand('add another')).toBe(true)
    expect(parseSpokenAddLineCommand('another')).toBe(true)
    expect(parseSpokenAddLineCommand('edit line 2')).toBe(false)
  })

  it('parses confirm actions', () => {
    expect(parseSpokenConfirm('save')).toBe('save')
    expect(parseSpokenConfirm('add another')).toBe('another')
    expect(parseSpokenConfirm('done')).toBe('done')
    expect(parseSpokenConfirm('that is all')).toBe('done')
  })

  it('parses edit line item number with digits and words', () => {
    expect(parseSpokenEditLineNumber('edit line item number 2', 3)).toBe(1)
    expect(parseSpokenEditLineNumber('audit line number three', 5)).toBe(2)
    expect(parseSpokenEditLineNumber('edit line item number 9', 3)).toBeNull()
    expect(parseSpokenEditLineNumber('edit line item number 1', 1)).toBe(0)
    expect(parseSpokenEditLineNumber('edited line one', 3)).toBe(0)
    expect(parseSpokenEditLineNumber('change line 2', 3)).toBe(1)
    expect(parseSpokenEditLineNumber('edit the line', 1)).toBe(0)
    expect(parseSpokenEditLineNumber('line item number 2', 3)).toBe(1)
  })

  it('maps spoken service to labor line type', () => {
    expect(parseSpokenLineType('service')).toBe('labor')
    expect(parseSpokenLineType('fee')).toBe('fee')
  })

  it('detects keep current answers', () => {
    expect(parseKeepCurrent('keep')).toBe(true)
    expect(parseKeepCurrent('same as before')).toBe(true)
    expect(parseKeepCurrent('labor')).toBe(false)
  })

  it('detects cancel with loose phrasing', () => {
    expect(parseSpokenCancel('cancel')).toBe(true)
    expect(parseSpokenCancel('cancelled')).toBe(true)
    expect(parseSpokenCancel('canceled')).toBe(true)
    expect(parseSpokenCancel('never mind')).toBe(true)
    expect(parseSpokenCancel('go back')).toBe(true)
    expect(parseSpokenCancel('forget it')).toBe(true)
    expect(parseSpokenCancel('start over')).toBe(true)
    expect(parseSpokenCancel('labor')).toBe(false)
  })

  it('parses edit field navigation', () => {
    expect(parseSpokenEditField('description')).toBe('description')
    expect(parseSpokenEditField('edit rate')).toBe('rate')
    expect(parseSpokenEditField('change quantity')).toBe('qty')
    expect(parseSpokenEditField('edit type')).toBe('type')
    expect(parseSpokenEditField('change the description')).toBe('description')
    expect(parseSpokenEditField('hours')).toBe('qty')
    expect(parseSpokenEditField('save')).toBe('confirm')
    expect(parseSpokenEditField('that looks good')).toBe('confirm')
    expect(parseSpokenEditField('labor')).toBeNull()
  })

  it('parses spoken numbers correctly', () => {
    expect(parseSpokenNumber('1')).toBe('1')
    expect(parseSpokenNumber('2.5')).toBe('2.5')
    expect(parseSpokenNumber('one')).toBe('1')
    expect(parseSpokenNumber('two')).toBe('2')
    expect(parseSpokenNumber('ten')).toBe('10')
    expect(parseSpokenNumber('half')).toBe('0.5')
    expect(parseSpokenNumber('quarter')).toBe('0.25')
    expect(parseSpokenNumber('$125')).toBe('125')
    expect(parseSpokenNumber('$45.50')).toBe('45.50')
    expect(parseSpokenNumber('1,500')).toBe('1500')
    expect(parseSpokenNumber('fifteen')).toBe('15')
    expect(parseSpokenNumber('twenty')).toBe('20')
    expect(parseSpokenNumber('hundred')).toBe('100')
  })

  it('returns empty string for non-numeric input', () => {
    expect(parseSpokenNumber('um')).toBe('')
    expect(parseSpokenNumber('for')).toBe('')
    expect(parseSpokenNumber('the')).toBe('')
    expect(parseSpokenNumber('labor')).toBe('')
    expect(parseSpokenNumber('hello there')).toBe('')
    expect(parseSpokenNumber('')).toBe('')
  })
})

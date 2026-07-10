import { describe, expect, it } from 'vitest'
import {
  parseSpokenAddLineCommand,
  parseSpokenCancel,
  parseSpokenEditField,
  parseSpokenEditLineNumber,
  parseSpokenLineType,
  parseKeepCurrent,
} from '../../app/utils/speech-line-flow'

describe('speech line flow commands', () => {
  it('detects add line commands', () => {
    expect(parseSpokenAddLineCommand('add a line')).toBe(true)
    expect(parseSpokenAddLineCommand('add another item')).toBe(true)
    expect(parseSpokenAddLineCommand('edit line 2')).toBe(false)
  })

  it('parses edit line item number', () => {
    expect(parseSpokenEditLineNumber('edit line item number 2', 3)).toBe(1)
    expect(parseSpokenEditLineNumber('audit line number three', 5)).toBe(2)
    expect(parseSpokenEditLineNumber('edit line item number 9', 3)).toBeNull()
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

  it('detects cancel while editing', () => {
    expect(parseSpokenCancel('cancel')).toBe(true)
    expect(parseSpokenCancel('never mind')).toBe(true)
    expect(parseSpokenCancel('go back')).toBe(true)
    expect(parseSpokenCancel('labor')).toBe(false)
  })

  it('parses edit field navigation', () => {
    expect(parseSpokenEditField('description')).toBe('description')
    expect(parseSpokenEditField('edit rate')).toBe('rate')
    expect(parseSpokenEditField('change quantity')).toBe('qty')
    expect(parseSpokenEditField('edit type')).toBe('type')
    expect(parseSpokenEditField('save')).toBe('confirm')
    expect(parseSpokenEditField('labor')).toBeNull()
  })
})

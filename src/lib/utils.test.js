import { describe, it, expect } from 'vitest'
import { cn, formatCount } from './utils'

describe('cn', () => {
    it('merges tailwind classes correctly', () => {
        expect(cn('p-2', 'p-4')).toBe('p-4')
        expect(cn('text-sm', undefined, 'font-bold')).toBe('text-sm font-bold')
    })
})

describe('formatCount', () => {
    it('formats thousands compactly', () => {
        expect(formatCount(1200)).toBe('1.2k')
        expect(formatCount(1000)).toBe('1k')
        expect(formatCount(15700)).toBe('15.7k')
        expect(formatCount(999)).toBe('999')
    })

    it('formats millions compactly', () => {
        expect(formatCount(1_000_000)).toBe('1M')
        expect(formatCount(3_450_000)).toBe('3.5M')
    })

    it('handles missing and invalid values safely', () => {
        expect(formatCount(null)).toBe('0')
        expect(formatCount(undefined)).toBe('0')
        expect(formatCount(0)).toBe('0')
        expect(formatCount('abc')).toBe('0')
    })

    it('accepts numeric strings', () => {
        expect(formatCount('2500')).toBe('2.5k')
    })
})

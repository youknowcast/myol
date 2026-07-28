import { describe, it, expect } from 'vitest'
import { distribute } from './converter.js'

describe('distribute', () => {
  it('splits evenly when weights are equal', () => {
    expect(distribute([1, 1], 4)).toEqual([2, 2])
  })

  it('gives the remainder to the largest fractional share', () => {
    // 暗い(2) 道が(2) 続いてて(4) -> F | C | G | G
    expect(distribute([2, 2, 4], 4)).toEqual([1, 1, 2])
  })

  it('splits 4:3 into two and two', () => {
    // 丸い大空(4) の色を(3) -> F | F | G | G
    expect(distribute([4, 3], 4)).toEqual([2, 2])
  })

  it('guarantees at least one measure per chord', () => {
    expect(distribute([1, 100], 4)).toEqual([1, 3])
  })

  it('returns one measure each when there are at least as many weights as measures', () => {
    expect(distribute([1, 1, 1, 1], 4)).toEqual([1, 1, 1, 1])
    expect(distribute([5, 1, 1, 1, 1], 4)).toEqual([1, 1, 1, 1, 1])
  })

  it('returns an empty array for no weights', () => {
    expect(distribute([], 4)).toEqual([])
  })

  it('always sums to the requested total', () => {
    expect(distribute([3, 1], 4).reduce((a, b) => a + b, 0)).toBe(4)
    expect(distribute([1, 2, 3], 8).reduce((a, b) => a + b, 0)).toBe(8)
  })
})

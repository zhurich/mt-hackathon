import { describe, expect, it } from 'vitest'
import { experience } from './labels'

describe('склонение «очков опыта»', () => {
  it.each([
    [1, '1 очко опыта'], [3, '3 очка опыта'], [5, '5 очков опыта'], [11, '11 очков опыта'],
    [21, '21 очко опыта'], [104, '104 очка опыта'], [112, '112 очков опыта'], [0, '0 очков опыта'],
  ])('%i', (amount, expected) => {
    expect(experience(amount)).toBe(expected)
  })
})

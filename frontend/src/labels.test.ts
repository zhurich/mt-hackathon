import { describe, expect, it } from 'vitest'
import { experience, levelProgress } from './labels'

describe('склонение «очков опыта»', () => {
  it.each([
    [1, '1 очко опыта'], [3, '3 очка опыта'], [5, '5 очков опыта'], [11, '11 очков опыта'],
    [21, '21 очко опыта'], [104, '104 очка опыта'], [112, '112 очков опыта'], [0, '0 очков опыта'],
  ])('%i', (amount, expected) => {
    expect(experience(amount)).toBe(expected)
  })
})

describe('подпись шкалы уровня', () => {
  const level = { index: 1, title: 'Проводник III класса', xp: 300, level_xp: 150, next_title: 'Проводник II класса', progress: 0.6 }
  it('считает от порога текущего уровня — как и сама шкала', () => {
    expect(levelProgress({ ...level, next_xp: 400 })).toBe('150 / 250 очков опыта')
  })
  it('на последнем уровне показывает сумму', () => {
    expect(levelProgress({ ...level, xp: 3200, level_xp: 3000, next_xp: null })).toBe('3200 очков опыта · максимум')
  })
})

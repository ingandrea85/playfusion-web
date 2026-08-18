import { describe, it, expect } from 'vitest'
import { renderCreateEvent } from '../src/views/create-event'

describe('create-event render', () => {
  it('renders sport, category and date fields and a submit', () => {
    const html = renderCreateEvent()
    expect(html).toContain('name="sport"')
    expect(html).toContain('data-cat-add') // add-category control
    expect(html).toContain('name="from"')
    expect(html).toContain('name="to"')
    expect(html).toMatch(/type="submit"|js-create/)
  })
})

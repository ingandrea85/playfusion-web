import { describe, it, expect } from 'vitest'
import { feeItem } from '../src/consumer.js'

// The consumer builds its own DocClient + publisher at module-load time; rather than
// mocking @playfusion/platform-lib (no precedent for that in this codebase — o3/o5
// read-model tests favor pure functions + fakes), the denormalization is a pure,
// exported `feeItem(detail)` helper that the handler calls when building the PutCommand
// Item. This test asserts that helper's output directly.
describe('o12 consumer feeItem', () => {
  it('denormalizes sportEventId onto the fee row from RegistrationApplied', () => {
    expect(feeItem({ registrationId: 'r1', sportEventId: 'e9' })).toEqual({
      registrationId: 'r1', sportEventId: 'e9', status: 'Requested',
    })
  })
})

import { test, expect } from 'vitest';
import { applyRegistration, confirmRegistration, rejectRegistration } from '../../src/domain/registration.js';
import { DomainError } from '@playfusion/platform-lib';

const base = { registrationId: 'reg-1', participantRef: 'team-7', sportEventId: 'evt-1', categoria: 'U15' };

test('test_applyRegistration_createsAppliedRequest', () => {
  expect(applyRegistration(base).status).toBe('Applied');
});

test('test_confirmRegistration_appliedBecomesConfirmed', () => {
  expect(confirmRegistration(applyRegistration(base)).status).toBe('Confirmed');
});

test('test_confirmRegistration_alreadyConfirmedIsDomainError', () => {
  const confirmed = confirmRegistration(applyRegistration(base));
  expect(() => confirmRegistration(confirmed)).toThrow(DomainError);
});

test('test_rejectRegistration_appliedBecomesRejected', () => {
  expect(rejectRegistration(applyRegistration(base), 'roster incompleto').status).toBe('Rejected');
});

test('test_rejectRegistration_afterConfirmIsDomainError', () => {
  const confirmed = confirmRegistration(applyRegistration(base));
  expect(() => rejectRegistration(confirmed, 'late')).toThrow(DomainError);
});

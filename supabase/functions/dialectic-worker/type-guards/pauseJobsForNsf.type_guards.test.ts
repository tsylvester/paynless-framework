// supabase/functions/dialectic-worker/type-guards/pauseJobsForNsf.type_guards.test.ts

import { describe, it } from 'https://deno.land/std@0.170.0/testing/bdd.ts';
import { assertEquals } from 'https://deno.land/std@0.170.0/testing/asserts.ts';
import type { PauseJobsForNsfParams } from '../../dialectic-service/dialectic.interface.ts';
import { isPauseJobsForNsfParams } from './pauseJobsForNsf.type_guards.ts';

const validParams: PauseJobsForNsfParams = {
	failingJobId: 'job-uuid-1',
	sessionId: 'session-uuid-2',
	stageSlug: 'thesis',
	iterationNumber: 0,
	projectId: 'project-uuid-3',
	projectOwnerUserId: 'user-uuid-4',
};

describe('pauseJobsForNsf type guards', () => {
	describe('isPauseJobsForNsfParams', () => {
		it('returns true for valid params with all six fields', () => {
			assertEquals(isPauseJobsForNsfParams(validParams), true);
		});

		it('returns true for valid params with positive iterationNumber', () => {
			const params: PauseJobsForNsfParams = { ...validParams, iterationNumber: 2 };
			assertEquals(isPauseJobsForNsfParams(params), true);
		});

		it('returns false for null', () => {
			assertEquals(isPauseJobsForNsfParams(null), false);
		});

		it('returns false for undefined', () => {
			assertEquals(isPauseJobsForNsfParams(undefined), false);
		});

		it('returns false for non-object (string)', () => {
			assertEquals(isPauseJobsForNsfParams('not an object'), false);
		});

		it('returns false for non-object (number)', () => {
			assertEquals(isPauseJobsForNsfParams(42), false);
		});

		it('returns false when failingJobId is missing', () => {
			const { failingJobId, ...rest } = validParams;
			assertEquals(isPauseJobsForNsfParams(rest), false);
		});

		it('returns false when sessionId is missing', () => {
			const { sessionId, ...rest } = validParams;
			assertEquals(isPauseJobsForNsfParams(rest), false);
		});

		it('returns false when stageSlug is missing', () => {
			const { stageSlug, ...rest } = validParams;
			assertEquals(isPauseJobsForNsfParams(rest), false);
		});

		it('returns false when iterationNumber is missing', () => {
			const { iterationNumber, ...rest } = validParams;
			assertEquals(isPauseJobsForNsfParams(rest), false);
		});

		it('returns false when projectId is missing', () => {
			const { projectId, ...rest } = validParams;
			assertEquals(isPauseJobsForNsfParams(rest), false);
		});

		it('returns false when projectOwnerUserId is missing', () => {
			const { projectOwnerUserId, ...rest } = validParams;
			assertEquals(isPauseJobsForNsfParams(rest), false);
		});

		it('returns false when failingJobId is empty string', () => {
			const params = { ...validParams, failingJobId: '' };
			assertEquals(isPauseJobsForNsfParams(params), false);
		});

		it('returns false when sessionId is empty string', () => {
			const params = { ...validParams, sessionId: '' };
			assertEquals(isPauseJobsForNsfParams(params), false);
		});

		it('returns false when iterationNumber is negative', () => {
			const params = { ...validParams, iterationNumber: -1 };
			assertEquals(isPauseJobsForNsfParams(params), false);
		});

		it('returns false when iterationNumber is not an integer', () => {
			const params = { ...validParams, iterationNumber: 1.5 };
			assertEquals(isPauseJobsForNsfParams(params), false);
		});

		it('returns false when iterationNumber is not a number', () => {
			const params = { ...validParams, iterationNumber: '0' as unknown as number };
			assertEquals(isPauseJobsForNsfParams(params), false);
		});

		it('returns false when a string field is a number', () => {
			const params = { ...validParams, failingJobId: 123 as unknown as string };
			assertEquals(isPauseJobsForNsfParams(params), false);
		});

		it('returns false when stageSlug is empty string', () => {
			const params = { ...validParams, stageSlug: '' };
			assertEquals(isPauseJobsForNsfParams(params), false);
		});

		it('returns false when projectId is empty string', () => {
			const params = { ...validParams, projectId: '' };
			assertEquals(isPauseJobsForNsfParams(params), false);
		});

		it('returns false when projectOwnerUserId is empty string', () => {
			const params = { ...validParams, projectOwnerUserId: '' };
			assertEquals(isPauseJobsForNsfParams(params), false);
		});
	});
});

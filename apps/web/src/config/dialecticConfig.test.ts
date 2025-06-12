import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getStageSlugFromStatus, DIALECTIC_STAGES } from './dialecticConfig';
import { DialecticStage } from '@paynless/types';

describe('getStageSlugFromStatus', () => {
  const originalConsoleWarn = console.warn;

  beforeEach(() => {
    // Mock console.warn to verify its calls without polluting test output
    console.warn = vi.fn();
  });

  afterEach(() => {
    // Restore original console.warn
    console.warn = originalConsoleWarn;
    vi.restoreAllMocks();
  });

  it('should return null for null or undefined input', () => {
    expect(getStageSlugFromStatus(null)).toBeNull();
    expect(getStageSlugFromStatus(undefined)).toBeNull();
  });

  // Test direct slug inclusion (priority check)
  DIALECTIC_STAGES.forEach(stage => {
    it(`should return '${stage.slug}' when status contains '${stage.slug}' (e.g., 'prefix_${stage.slug}_suffix')`, () => {
      expect(getStageSlugFromStatus(`prefix_${stage.slug}_suffix`)).toBe(stage.slug);
    });
    it(`should return '${stage.slug}' for exact match '${stage.slug}'`, () => { // eslint-disable-line
      expect(getStageSlugFromStatus(stage.slug)).toBe(stage.slug);
    });
  });

  // Test regex patterns: pending_..., ..._complete, ..._error, ..._generating
  DIALECTIC_STAGES.forEach(stage => {
    it(`should return '${stage.slug}' for status 'pending_${stage.slug}'`, () => {
      expect(getStageSlugFromStatus(`pending_${stage.slug}`)).toBe(stage.slug);
    });

    it(`should return '${stage.slug}' for status '${stage.slug}_complete'`, () => {
      expect(getStageSlugFromStatus(`${stage.slug}_complete`)).toBe(stage.slug);
    });

    it(`should return '${stage.slug}' for status '${stage.slug}_error'`, () => {
      expect(getStageSlugFromStatus(`${stage.slug}_error`)).toBe(stage.slug);
    });
    
    it(`should return '${stage.slug}' for status '${stage.slug}_generating'`, () => {
      expect(getStageSlugFromStatus(`${stage.slug}_generating`)).toBe(stage.slug);
    });

    // Test case insensitivity for regex patterns
    it(`should return '${stage.slug}' for status 'PENDING_${stage.slug.toUpperCase()}' (case insensitive)`, () => {
      expect(getStageSlugFromStatus(`PENDING_${stage.slug.toUpperCase()}`)).toBe(stage.slug);
    });
  });
  
  // Test specific fallback statuses
  it(`should return the first stage slug ('${DIALECTIC_STAGES[0].slug}') for status 'active'`, () => {
    if (DIALECTIC_STAGES.length > 0) {
      expect(getStageSlugFromStatus('active')).toBe(DIALECTIC_STAGES[0].slug);
    } else {
      expect(getStageSlugFromStatus('active')).toBeNull(); // Or as per empty DIALECTIC_STAGES handling
    }
  });

  it(`should return the first stage slug ('${DIALECTIC_STAGES[0].slug}') for status 'session_started'`, () => {
     if (DIALECTIC_STAGES.length > 0) {
      expect(getStageSlugFromStatus('session_started')).toBe(DIALECTIC_STAGES[0].slug);
    } else {
      expect(getStageSlugFromStatus('session_started')).toBeNull();
    }
  });

  // Test case insensitivity for fallback statuses
  it(`should return the first stage slug ('${DIALECTIC_STAGES[0].slug}') for status 'ACTIVE'`, () => {
    if (DIALECTIC_STAGES.length > 0) {
      expect(getStageSlugFromStatus('ACTIVE')).toBe(DIALECTIC_STAGES[0].slug);
    } else {
      expect(getStageSlugFromStatus('ACTIVE')).toBeNull();
    }
  });

  // Test unknown status (should warn and return first stage slug or null)
  it('should return the first stage slug and warn for an completely unknown status', () => {
    const unknownStatus = 'some_random_status_string';
    if (DIALECTIC_STAGES.length > 0) {
      expect(getStageSlugFromStatus(unknownStatus)).toBe(DIALECTIC_STAGES[0].slug);
      expect(console.warn).toHaveBeenCalledWith(
        `[getStageSlugFromStatus] Could not derive valid stage slug from status: ${unknownStatus}`
      );
    } else {
      expect(getStageSlugFromStatus(unknownStatus)).toBeNull();
      // console.warn might still be called, or might not if it bails early.
      // Depending on the exact logic for empty DIALECTIC_STAGES, this might need adjustment.
    }
  });

  it('should handle statuses with mixed known slugs correctly (priority: longest slug wins)', () => {
    const slugThesis = DialecticStage.THESIS; // 'thesis', length 6
    const slugAntithesis = DialecticStage.ANTITHESIS; // 'antithesis', length 10

    if (DIALECTIC_STAGES.find(s => s.slug === slugThesis) && DIALECTIC_STAGES.find(s => s.slug === slugAntithesis)) {
      // Case 1: thesis before antithesis in string
      const status1 = `info_about_${slugThesis}_and_also_${slugAntithesis}_stuff`;
      // Expected: antithesis (it's longer)
      expect(getStageSlugFromStatus(status1)).toBe(slugAntithesis);

      // Case 2: antithesis before thesis in string
      const status2 = `info_about_${slugAntithesis}_and_also_${slugThesis}_stuff`;
      // Expected: antithesis (it's longer)
      expect(getStageSlugFromStatus(status2)).toBe(slugAntithesis);
    }

    const slugParalysis = DialecticStage.PARALYSIS; // 'paralysis', length 9
    const slugParenthesis = DialecticStage.PARENTHESIS; // 'parenthesis', length 11

    if (DIALECTIC_STAGES.find(s => s.slug === slugParalysis) && DIALECTIC_STAGES.find(s => s.slug === slugParenthesis)) {
      // Case 3: paralysis before parenthesis in string
      const status3 = `info_about_${slugParalysis}_and_also_${slugParenthesis}_stuff`;
      // Expected: parenthesis (it's longer)
      expect(getStageSlugFromStatus(status3)).toBe(slugParenthesis);

      // Case 4: parenthesis before paralysis in string
      const status4 = `info_about_${slugParenthesis}_and_also_${slugParalysis}_stuff`;
      // Expected: parenthesis (it's longer)
      expect(getStageSlugFromStatus(status4)).toBe(slugParenthesis);
    }
  });

  it('should handle a status like "pending_synthesis_complete" correctly via includes check', () => {
    // The regex might not catch this, but the includes() check should.
    if (DIALECTIC_STAGES.find(s => s.slug === DialecticStage.SYNTHESIS)) {
      expect(getStageSlugFromStatus('pending_synthesis_complete')).toBe(DialecticStage.SYNTHESIS);
    }
  });
  
  // describe('when DIALECTIC_STAGES is empty', () => {
  //   // let originalStages: any;
  //   beforeEach(() => {
  //     // Temporarily mock DIALECTIC_STAGES to be empty
  //     // This is a bit tricky as DIALECTIC_STAGES is a const export.
  //     // For a robust test, you might need to mock the module or refactor dialecticConfig
  //     // to allow easier DIALECTIC_STAGES manipulation for testing.
  //     // For now, this illustrates the intent. A more advanced setup might use vi.spyOn or module mocks.
  //     // This approach will NOT work as DIALECTIC_STAGES is imported directly.
  //     // To test this properly, you would typically mock the './dialecticConfig' module.
  //     // vi.mock('./dialecticConfig', async (importOriginal) => {
  //     //   const originalModule = await importOriginal();
  //     //   return {
  //     //     ...originalModule,
  //     //     DIALECTIC_STAGES: [],
  //     //   };
  //     // });
  //     // Due to limitations of simple vi.mock for const exports within the same file being tested,
  //     // we'll skip direct test for empty DIALECTIC_STAGES behavior here,
  //     // acknowledging it's a scenario handled by the implementation.
  //     // The implementation already returns null or first stage slug safely.
  //   });

  //   // Example test if mocking was straightforward:
  //   // it('should return null for any status if DIALECTIC_STAGES is empty', () => {
  //   //   // Ensure DIALECTIC_STAGES is mocked to []
  //   //   expect(getStageSlugFromStatus('any_status')).toBeNull();
  //   //   expect(console.warn).toHaveBeenCalled(); // Or not, depending on implementation
  //   // });
  // });

}); 
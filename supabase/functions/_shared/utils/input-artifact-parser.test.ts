import { expect } from 'https://deno.land/x/expect@v0.4.0/mod.ts';
import { parseInputArtifactRules } from './input-artifact-parser.ts';
import type { InputArtifactRules } from '../../dialectic-service/dialectic.interface.ts';
import type { Json } from '../../types_db.ts';
// Using Deno.test() for defining tests

Deno.test('parseInputArtifactRules - should correctly parse a valid contribution rule', () => {
  const jsonData: Json = {
    sources: [
      { type: 'contribution', stage_slug: 'thesis' },
    ],
  };
  const expected: InputArtifactRules = {
    sources: [
      { type: 'contribution', stage_slug: 'thesis' },
    ],
  };
  expect(parseInputArtifactRules(jsonData)).toEqual(expected);
});

Deno.test('parseInputArtifactRules - should correctly parse a valid feedback rule', () => {
  const jsonData: Json = {
    sources: [
      { type: 'feedback', stage_slug: 'antithesis', required: true },
    ],
  };
  const expected: InputArtifactRules = {
    sources: [
      { type: 'feedback', stage_slug: 'antithesis', required: true },
    ],
  };
  expect(parseInputArtifactRules(jsonData)).toEqual(expected);
});

Deno.test('parseInputArtifactRules - should correctly parse a rule with all optional fields', () => {
  const jsonData: Json = {
    sources: [
      {
        type: 'contribution',
        stage_slug: 'synthesis',
        purpose: 'To gather insights',
        required: false,
        multiple: true,
        section_header: 'Synthesis Insights',
      },
    ],
  };
  const expected: InputArtifactRules = {
    sources: [
      {
        type: 'contribution',
        stage_slug: 'synthesis',
        purpose: 'To gather insights',
        required: false,
        multiple: true,
        section_header: 'Synthesis Insights',
      },
    ],
  };
  expect(parseInputArtifactRules(jsonData)).toEqual(expected);
});

Deno.test('parseInputArtifactRules - should throw an error if data is null', () => {
  expect(() => parseInputArtifactRules(null)).toThrow('Rules must be a JSON object.');
});

Deno.test('parseInputArtifactRules - should throw an error if sources key is missing', () => {
  const jsonData: Json = { otherKey: 'someValue' };
  expect(() => parseInputArtifactRules(jsonData)).toThrow('Rules object must contain a "sources" array.');
});

Deno.test('parseInputArtifactRules - should throw an error if a rule is missing the type field', () => {
  const jsonData: Json = {
    sources: [{ stage_slug: 'thesis' }],
  };
  expect(() => parseInputArtifactRules(jsonData)).toThrow('Source at index 0 must contain a valid "type" string property.');
});

Deno.test('parseInputArtifactRules - should throw an error if a rule has an invalid type', () => {
  const jsonData: Json = {
    sources: [{ type: 'invalid_type', stage_slug: 'thesis' }],
  };
  expect(() => parseInputArtifactRules(jsonData)).toThrow('Source at index 0 has an invalid "type". Expected \'contribution\', \'feedback\', or \'initial_project_prompt\', got "invalid_type".');
});

// Additional RED tests to be added:
// - data is not an object (e.g., string, number)
// - data is an array
// - sources is not an array (e.g., string, object)
// - a rule object in sources is null
// - a rule object in sources is not an object (e.g., string)
// - a rule object is missing 'stage_slug'
// - a rule object has a non-string 'stage_slug'
// - multiple rules in the sources array (valid case)
// - rules with optional fields having unexpected types (though current function might not deeply validate these, good to document) 
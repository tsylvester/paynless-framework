import { expect } from 'https://deno.land/x/expect@v0.4.0/mod.ts';
import { parseInputArtifactRules } from './input-artifact-parser.ts';
import { InputRule } from '../../dialectic-service/dialectic.interface.ts';
import { FileType } from '../types/file_manager.types.ts';
import { isJson } from './type-guards/type_guards.common.ts';

Deno.test('parseInputArtifactRules - should correctly parse a valid document rule', () => {
    const inputRules: InputRule[] = [
        { type: 'document', slug: 'thesis', document_key: FileType.business_case },
    ];
    const expected: InputRule[] = [
        { type: 'document', slug: 'thesis', document_key: FileType.business_case },
    ];
    if(!isJson(inputRules)) {
        throw new Error('Input rules must be an array.');
    }
    expect(parseInputArtifactRules(inputRules)).toEqual(expected);
});

Deno.test('parseInputArtifactRules - should correctly parse a valid feedback rule', () => {
    const inputRules: InputRule[] = [
        { type: 'feedback', slug: 'antithesis', required: true },
    ];
    const expected: InputRule[] = [
        { type: 'feedback', slug: 'antithesis', required: true },
    ];
    if(!isJson(inputRules)) {
        throw new Error('Input rules must be an array.');
    }
    expect(parseInputArtifactRules(inputRules)).toEqual(expected);
});

Deno.test('parseInputArtifactRules - should correctly parse a rule with all optional fields', () => {
    const inputRules: InputRule[] = [
        {
            type: 'document',
            slug: 'synthesis',
            document_key: FileType.business_case,
            required: false,
            multiple: true,
            section_header: 'Synthesis Insights',
        },
    ];
    const expected: InputRule[] = [
        {
            type: 'document',
            slug: 'synthesis',
            document_key: FileType.business_case,
            required: false,
            multiple: true,
            section_header: 'Synthesis Insights',
        },
    ];
    if(!isJson(inputRules)) {
        throw new Error('Input rules must be an array.');
    }
    expect(parseInputArtifactRules(inputRules)).toEqual(expected);
});

Deno.test('parseInputArtifactRules - should correctly parse a valid header_context rule', () => {
    const inputRules: InputRule[] = [
        { type: 'header_context', slug: 'synthesis', document_key: FileType.header_context_pairwise, required: true },
    ];
    const expected: InputRule[] = [
        { type: 'header_context', slug: 'synthesis', document_key: FileType.header_context_pairwise, required: true },
    ];
    if(!isJson(inputRules)) {
        throw new Error('Input rules must be an array.');
    }
    expect(parseInputArtifactRules(inputRules)).toEqual(expected);
});

Deno.test('parseInputArtifactRules - should correctly parse a valid seed_prompt rule', () => {
    const inputRules: InputRule[] = [
        { type: 'seed_prompt', slug: 'synthesis', document_key: FileType.SeedPrompt, required: true },
    ];
    const expected: InputRule[] = [
        { type: 'seed_prompt', slug: 'synthesis', document_key: FileType.SeedPrompt, required: true },
    ];
    if(!isJson(inputRules)) {
        throw new Error('Input rules must be an array.');
    }
    expect(parseInputArtifactRules(inputRules)).toEqual(expected);
});

Deno.test('parseInputArtifactRules - should correctly parse a complex array of mixed rules', () => {
    const inputRules: InputRule[] = [
        { type: 'seed_prompt', slug: 'synthesis', document_key: FileType.SeedPrompt, required: true },
        { type: 'document', slug: 'thesis', document_key: FileType.business_case, required: true, multiple: true },
        { type: 'document', slug: 'antithesis', document_key: FileType.comparison_vector, required: true, multiple: true },
        { type: 'feedback', slug: 'antithesis', document_key: FileType.risk_register, required: false, multiple: true },
        { type: 'header_context', slug: 'synthesis', document_key: FileType.header_context_pairwise, required: true },
    ];
    const expected: InputRule[] = [
        { type: 'seed_prompt', slug: 'synthesis', document_key: FileType.SeedPrompt, required: true },
        { type: 'document', slug: 'thesis', document_key: FileType.business_case, required: true, multiple: true },
        { type: 'document', slug: 'antithesis', document_key: FileType.comparison_vector, required: true, multiple: true },
        { type: 'feedback', slug: 'antithesis', document_key: FileType.risk_register, required: false, multiple: true },
        { type: 'header_context', slug: 'synthesis', document_key: FileType.header_context_pairwise, required: true },
    ];
    if(!isJson(inputRules)) {
        throw new Error('Input rules must be an array.');
    }
    expect(parseInputArtifactRules(inputRules)).toEqual(expected);
});

Deno.test('parseInputArtifactRules - should correctly parse a valid contribution rule', () => {
    const inputRules: InputRule[] = [
        { type: 'contribution', slug: 'antithesis', document_key: FileType.comparison_vector, required: true },
    ];
    const expected: InputRule[] = [
        { type: 'contribution', slug: 'antithesis', document_key: FileType.comparison_vector, required: true },
    ];
    if(!isJson(inputRules)) {
        throw new Error('Input rules must be an array.');
    }
    expect(parseInputArtifactRules(inputRules)).toEqual(expected);
});

Deno.test('parseInputArtifactRules - should correctly parse a valid project_resource rule', () => {
    const inputRules: InputRule[] = [
        { type: 'project_resource', slug: 'thesis', document_key: FileType.InitialUserPrompt, required: true },
    ];
    const expected: InputRule[] = [
        { type: 'project_resource', slug: 'thesis', document_key: FileType.InitialUserPrompt, required: true },
    ];
    if(!isJson(inputRules)) {
        throw new Error('Input rules must be an array.');
    }
    expect(parseInputArtifactRules(inputRules)).toEqual(expected);
});

Deno.test('parseInputArtifactRules - should throw an error if data is not an array', () => {
    const invalidInput: any = { sources: [] }; // The old format is now invalid
    expect(() => parseInputArtifactRules(invalidInput)).toThrow('Input rules must be an array.');
});

Deno.test('parseInputArtifactRules - should throw an error if a rule is missing the type field', () => {
    const inputRules: any[] = [{ stage_slug: 'thesis', document_key: 'business_case' }];
    expect(() => parseInputArtifactRules(inputRules)).toThrow('Input rule at index 0 must contain a valid "type" string property.');
});

Deno.test('parseInputArtifactRules - should throw an error if a rule has an invalid type', () => {
    const inputRules: any[] = [{ type: 'invalid_type', stage_slug: 'thesis' }];
    expect(() => parseInputArtifactRules(inputRules)).toThrow('Input rule at index 0 has an invalid "type".');
}); 
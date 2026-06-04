/**
 * Basic Skill Generation
 * Generate a SKILL.md from an ExtractedSkill object — the simplest possible usage.
 */

import { renderSkill, writeSkills } from '@skillit/core';
import type { ExtractedSkill } from '@skillit/core';

const skill: ExtractedSkill = {
  name: 'my-library',
  description: 'A library that does useful things',
  packageDescription: 'Utilities for data transformation and validation',
  keywords: ['transform', 'validate', 'data'],
  functions: [
    {
      name: 'transform',
      description: 'Transform input data using a pipeline',
      signature: 'transform<T>(input: T, pipeline: Pipeline<T>): T',
      parameters: [
        { name: 'input', type: 'T', description: 'The data to transform', optional: false },
        {
          name: 'pipeline',
          type: 'Pipeline<T>',
          description: 'Ordered list of transform steps',
          optional: false
        }
      ],
      returnType: 'T',
      examples: [],
      tags: {}
    }
  ],
  classes: [],
  types: [],
  enums: [],
  variables: [],
  examples: []
};

const rendered = renderSkill(skill, { maxTokens: 4000 });
writeSkills([rendered], { outDir: 'skills' });

console.log(`Generated ${rendered.skill.filename}`);
console.log(`  ${rendered.references.length} reference files`);

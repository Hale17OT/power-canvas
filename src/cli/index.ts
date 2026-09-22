#!/usr/bin/env node
import {CommanderError} from 'commander';
import {ZodError} from 'zod';
import {PowerCanvasError,publicError} from '../core/errors.js';
import {emitError} from './output.js';
import {createProgram} from './program.js';

try {await createProgram().parseAsync(process.argv);}
catch(error){
  if(error instanceof CommanderError&&error.exitCode===0)process.exitCode=0;
  else{
    const safe=error instanceof CommanderError?new PowerCanvasError('PF-CLI-001','Invalid command or arguments.','Run powercanvas --help for implemented commands.'):error instanceof ZodError?new PowerCanvasError('PF-VALIDATION-003','An argument, stored record or Microsoft response has an invalid shape.','Check UUIDs, aliases, URLs and adapter compatibility. No raw response or credentials are printed.'):publicError(error);
    emitError(safe,process.argv.includes('--json'));process.exitCode=1;
  }
}

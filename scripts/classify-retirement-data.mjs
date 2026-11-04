#!/usr/bin/env node
import fs from 'node:fs';
import { classifyRetirement } from '../lib/retirement-classification.mjs';
try {
  const args=process.argv.slice(2);
  if(args.length<2||args.length>3)throw new Error();
  const read=file=>{if(fs.statSync(file).size>2*1024*1024)throw new Error();return JSON.parse(fs.readFileSync(file,'utf8'));};
  console.log(JSON.stringify(classifyRetirement(read(args[0]),read(args[1]),args[2]?read(args[2]):{}),null,2));
} catch {console.error('Classification failed: provide bounded metadata inventory, matching columns and optional private decision references; input details omitted.');process.exitCode=1;}

import { availableParallelism, totalmem } from 'node:os';
// Two GiB per browser process plus two GiB for server/OS. Never exceed four.
export function ciWorkers({cpus=availableParallelism(), memory=totalmem()}={}) {
  if(!Number.isFinite(cpus)||!Number.isFinite(memory)||cpus<1||memory<1) return 1;
  return Math.max(1,Math.min(4,Math.floor(cpus),Math.floor((memory/2**30-2)/2)));
}

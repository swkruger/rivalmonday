import { alertTools } from './alerts';
import { briefTools } from './briefs';
import { clientTools } from './clients';
import { reportTools } from './reports';

/** Every registered tool. Each 5b-1 task appends its array here. */
export const allTools = [...clientTools, ...briefTools, ...alertTools, ...reportTools];

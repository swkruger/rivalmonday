import { alertTools } from './alerts';
import { briefTools } from './briefs';
import { clientTools } from './clients';
import { competitorTools } from './competitors';
import { onboardingTools } from './onboarding';
import { pageTools } from './pages';
import { reportTools } from './reports';

/** Every registered tool. Each 5b-1 task appends its array here. */
export const allTools = [...clientTools, ...briefTools, ...alertTools, ...reportTools, ...onboardingTools, ...competitorTools, ...pageTools];

import { alertQueueTools } from './alert-queue';
import { alertTools } from './alerts';
import { briefTools } from './briefs';
import { clientTools } from './clients';
import { competitorTools } from './competitors';
import { onboardingTools } from './onboarding';
import { pageTools } from './pages';
import { portfolioTools } from './portfolio';
import { reportTools } from './reports';
import { reviewTools } from './review';

/** Every registered tool. Each 5b-1 task appends its array here. */
export const allTools = [...clientTools, ...briefTools, ...alertTools, ...alertQueueTools, ...reportTools, ...onboardingTools, ...competitorTools, ...pageTools, ...portfolioTools, ...reviewTools];

import { alertQueueTools } from './alert-queue';
import { alertTools } from './alerts';
import { briefTools } from './briefs';
import { clientTools } from './clients';
import { competitorTools } from './competitors';
import { eventTools } from './events';
import { modelOpsTools } from './model-ops';
import { onboardingTools } from './onboarding';
import { pageTools } from './pages';
import { playbookTools } from './playbooks';
import { portfolioTools } from './portfolio';
import { prospectTools } from './prospects';
import { recommendationTools } from './recommendations';
import { reportTools } from './reports';
import { reviewTools } from './review';
import { settingsTools } from './settings';
import { themeTools } from './themes';
import { usageTools } from './usage';

/** Every registered tool. Each 5b-1/5b-2 task appends its array here. */
export const allTools = [...clientTools, ...briefTools, ...alertTools, ...alertQueueTools, ...reportTools, ...onboardingTools, ...competitorTools, ...pageTools, ...portfolioTools, ...reviewTools, ...recommendationTools, ...usageTools, ...playbookTools, ...modelOpsTools, ...themeTools, ...prospectTools, ...settingsTools, ...eventTools];

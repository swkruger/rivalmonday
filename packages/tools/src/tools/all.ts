import { alertQueueTools } from './alert-queue';
import { alertRuleTools } from './alert-rules';
import { alertTools } from './alerts';
import { adTools } from './ads';
import { briefTools } from './briefs';
import { clientTools } from './clients';
import { competitorProfileTools } from './competitor-profile';
import { competitorTools } from './competitors';
import { eventTools } from './events';
import { evidenceTools } from './evidence';
import { modelOpsTools } from './model-ops';
import { moveTools } from './moves';
import { onboardingTools } from './onboarding';
import { overviewTools } from './overview';
import { pageTools } from './pages';
import { playbookTools } from './playbooks';
import { portfolioTools } from './portfolio';
import { pricingTools } from './pricing';
import { prospectTools } from './prospects';
import { recommendationTools } from './recommendations';
import { reportTools } from './reports';
import { reputationTools } from './reputation';
import { reviewTools } from './review';
import { settingsTools } from './settings';
import { themeTools } from './themes';
import { usageTools } from './usage';

/** Every registered tool. Each 5b-1/5b-2 task appends its array here. */
export const allTools = [...clientTools, ...briefTools, ...alertTools, ...alertQueueTools, ...reportTools, ...onboardingTools, ...competitorTools, ...pageTools, ...portfolioTools, ...reviewTools, ...recommendationTools, ...usageTools, ...playbookTools, ...modelOpsTools, ...themeTools, ...prospectTools, ...settingsTools, ...eventTools, ...evidenceTools, ...moveTools, ...competitorProfileTools, ...overviewTools, ...alertRuleTools, ...pricingTools, ...adTools, ...reputationTools];

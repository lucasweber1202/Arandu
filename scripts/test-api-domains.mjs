import assert from 'node:assert/strict';
import { createAuthDomain } from '../lib/api/domains/auth.mjs';
import { createPilotDomain } from '../lib/api/domains/pilot.mjs';
import { createPublicContentDomain } from '../lib/api/domains/public-content.mjs';
import { createIntakeDomain } from '../lib/api/domains/intake.mjs';
import { createAdminOperationsDomain } from '../lib/api/domains/admin-operations.mjs';
import { createSelectionsDomain } from '../lib/api/domains/selections.mjs';
import { createAccountsDomain } from '../lib/api/domains/accounts.mjs';
import { createPrivacyDomain } from '../lib/api/domains/privacy.mjs';
import { createDashboardDomain } from '../lib/api/domains/dashboard.mjs';

const contracts = [
  [createAuthDomain, ['handleAuth', 'optionalUser', 'requireUser']],
  [createPilotDomain, ['handleEvents', 'handlePilot', 'validPilotSessionId']],
  [createPublicContentDomain, ['handleSecurityText', 'handleCertificates', 'handleCertificateDocument', 'handleCatalog', 'handleArtists', 'handlePublicConfig', 'publicSiteUrl']],
  [createIntakeDomain, ['handleForms', 'handleReservations', 'handleProposals']],
  [createAdminOperationsDomain, ['handleAdmin', 'handleAdminUpdate', 'handleOperational', 'handleMedia', 'handleCatalogReview']],
  [createSelectionsDomain, ['handleSelections']],
  [createAccountsDomain, ['handleAccount', 'handlePortal', 'handleArtistAccounts']],
  [createPrivacyDomain, ['handlePrivacy', 'handleConversionEvents']],
  [createDashboardDomain, ['handleDashboard']]
];

for (const [factory, handlers] of contracts) {
  const domain = factory({});
  for (const handler of handlers) {
    assert.equal(typeof domain[handler], 'function', `${factory.name} deve expor ${handler}`);
  }
}

console.log(`Domain contract check: ${contracts.length} módulos e ${contracts.flatMap(([, handlers]) => handlers).length} contratos verificados.`);

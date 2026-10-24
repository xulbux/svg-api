/**
 * Maven Central service preset – Live upstream metrics and redirect transformations.
 */

import {
  asJsonObject,
  createEndpoint,
  defineService,
  readFirstObjectEntry,
} from '@/services/endpoint';
import { createVersionMetric, readText } from '@/services/metrics';

// ---------------------------------------- TYPES ----------------------------------------

/** Projected Maven Central artifact metadata (`search.maven.org/solrsearch/select`). */
interface MavenArtifactProjection {
  /** Latest published artifact version (`response.docs[0].latestVersion`). */
  version?: string;
}

// ------------------------------------ REGEX PATTERNS -----------------------------------

/** Matches a Maven coordinate identifier (ASCII letters, digits, dots, underscores, and hyphens; Excludes Lucene boolean operators). */
const MAVEN_COORD_RX = /^(?!(?:AND|OR|NOT)$)[A-Za-z\d][A-Za-z\d._-]{0,127}$/;

// -------------------------------------- INTERNALS --------------------------------------

/** Project a Maven Central Solr search response to the first artifact's `latestVersion` (empty `docs` is not found). */
function projectMavenArtifact(data: unknown): MavenArtifactProjection | undefined {
  const firstDoc = readFirstObjectEntry(asJsonObject(asJsonObject(data)?.response)?.docs);
  return firstDoc ? { version: readText(firstDoc.latestVersion) } : undefined;
}

/** Maven Central Solr search endpoint (1 row) with Sonatype Central artifact page redirect. */
const MAVEN_ENDPOINT = createEndpoint({
  api: 'https://search.maven.org/solrsearch/select?q=g:{owner}+AND+a:{target}&rows=1&wt=json',
  page: 'https://central.sonatype.com/artifact/{owner}/{target}',
  project: projectMavenArtifact,
});

// -------------------------------------- PUBLIC API -------------------------------------

/** Maven Central service preset (`maven`). */
export const MAVEN_SERVICE = defineService({
  docs: {
    description: 'Latest artifact version on Maven Central by groupId and artifactId.',
    title: 'Maven Central',
  },
  metrics: {
    v: createVersionMetric(
      MAVEN_ENDPOINT,
      { defaultColor: 'orange', defaultIcon: 'apachemaven', defaultLabel: 'Maven' },
      (artifact) => artifact.version
    ),
  },
  route: {
    owner: { isRequired: true, pattern: MAVEN_COORD_RX, placeholder: ':group' },
    target: { pattern: MAVEN_COORD_RX, placeholder: ':artifact' },
  },
});

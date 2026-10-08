/**
 * Homework register: the single source for the homepage table and for the
 * header of each homework page.
 *
 * Entry shape:
 * {
 *   number: 1,                         // integer; page lives at homework/01/
 *   title: 'Title of the assignment',
 *   abstract: 'One or two sentences summarising the work.',
 *   topics: ['Topic', 'Topic'],
 *   published: '2026-10-15',           // ISO date (publication or due date)
 *   status: 'published',               // 'published' | 'upcoming'
 * }
 *
 * A published entry requires the folder homework/NN/index.html, and every
 * homework folder (except those starting with "_") requires an entry here;
 * the build fails otherwise.
 */
export default [];

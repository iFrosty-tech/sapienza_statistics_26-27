/**
 * Identity and course context printed on every page.
 * This is the only place to edit these facts; the build injects them into the
 * shared partials through {{site.*}} tokens.
 */
export default {
  author: 'Marco Verri',
  // TODO: replace with the real student ID (matricola). While it is all zeros the
  // build marks the field as pending so the placeholder is never mistaken for data.
  studentId: '0000000',
  degree: 'MSc in Cybersecurity',
  degreeNative: 'Laurea Magistrale',
  course: 'Statistics',
  university: 'Sapienza University of Rome',
  academicYear: '2026/27',
  siteUrl: 'https://ifrosty-tech.github.io/sapienza_statistics_26-27/',
  repoUrl: 'https://github.com/ifrosty-tech/sapienza_statistics_26-27',
};

import codek from '@codek/eslint-config';
import globals from 'globals';
export default [...codek, { ignores: ['.next/**', 'next-env.d.ts'] }, { languageOptions: { globals: { ...globals.browser, ...globals.node } } }];

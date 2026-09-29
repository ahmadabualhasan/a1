import codek from '@codek/eslint-config';
import globals from 'globals';
export default [...codek, { languageOptions: { globals: { ...globals.browser, ...globals.node } } }];

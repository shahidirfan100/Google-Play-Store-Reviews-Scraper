import prettier from 'eslint-config-prettier';

import apify from '@apify/eslint-config/js.js';

export default [
    { ignores: ['**/dist'] },
    ...apify,
    prettier,
    {
        files: ['eslint.config.mjs'],
        rules: {
            'import-x/no-default-export': 'off',
        },
    },
];

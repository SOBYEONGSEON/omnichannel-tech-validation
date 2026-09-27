import js from '@eslint/js';
import ts from 'typescript-eslint';
export default ts.config({ignores:['dist/**','.tools/**','artifacts/**','node_modules/**']},js.configs.recommended,...ts.configs.recommended,{languageOptions:{globals:{document:'readonly',fetch:'readonly',setInterval:'readonly',clearInterval:'readonly'}},rules:{'no-control-regex':'off','@typescript-eslint/no-explicit-any':'off','@typescript-eslint/no-unused-vars':['error',{argsIgnorePattern:'^_'}],'no-empty':['error',{allowEmptyCatch:true}]}});

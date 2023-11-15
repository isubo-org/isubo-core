import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import copy from 'rollup-plugin-copy';
import { terser } from 'rollup-plugin-terser';

const esm = {
  input: {
    index: 'index.js',
  },
  output: {
    dir: 'dist',
    format: 'es',
    plugins: [terser()],
  },
  plugins: [
    copy({
      targets: [
        // { src: 'assets/conf.template.yml', dest: 'dist/assets' },
        { src: ['package.json', 'README.md'], dest: 'dist/' },
      ]
    })
  ]
};

const cjs = {
  input: {
    'index.cjs': 'index.js',
  },
  output: {
    dir: 'dist',
    format: 'cjs',
    plugins: [terser()],
  },
  plugins: [
    resolve({
      preferBuiltins: true,
    }),
    json(),
    commonjs(),
  ],
  external: ['markdown-toc']
};

export default [
  esm,
  cjs,
];

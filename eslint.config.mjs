// ESLint 平坦配置：与 prettier 分工——prettier 管格式，这里只管正确性。
// 用非类型检查版 recommended（type-aware 规则要在全量 .ts 上跑项目服务，CI 代价不值）。
//
// ignores：
//   - public/dist/**  构建产物（压缩后代码，误报无意义）
//   - .edgeone/**     EdgeOne 构建输出
//   - public/emoji/** 本地 SVG 资源，无 JS
import eslint from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['public/dist/**', '.edgeone/**', 'public/emoji/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // 项目既有风格：deno.json 同样排除了该规则，src 大量使用 any 承接上游 JSON
      '@typescript-eslint/no-explicit-any': 'off',
      // 空 catch 是刻意的降级手段（回退默认值 / 走 stale 兜底），由注释说明原因
      'no-empty': ['error', { allowEmptyCatch: true }],
      // 下划线开头的变量/参数是既定的占位符约定（如解构 `([_, v])`）
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // 初始值在所有分支都会被覆盖的「let x = 默认值」写法遍布既有代码，
      // 逐个改写有行为风险，收益只是消灭几行冗余赋值，先不启用
      'no-useless-assignment': 'off',
    },
  },
  {
    // TS 文件不需要 no-undef（tsc 已负责），浏览器/Node 全局量只在非 TS 的
    // 前端与脚本文件里声明
    files: ['public/**/*.js', 'scripts/**/*.mjs', '*.mjs'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
)

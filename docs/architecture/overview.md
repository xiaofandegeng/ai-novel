# 架构总览

更新日期：2026-08-11  
状态：当前有效

## 1. 系统边界

AI 小说创作工作台是 pnpm monorepo。前端只提供项目列表、自动写作驾驶舱和项目设置；故事、人物、关系、冲突、伏笔、知识检索和质量指标作为自动写作上下文与后端领域存在。

```text
Vue Web
  → /api HTTP
Hono API
  → domain modules
  → Drizzle ORM
PostgreSQL + pgvector

packages/shared  前后端契约
packages/ui      前端设计系统
```

## 2. 仓库结构

```text
ai-novel/
├── apps/
│   ├── api/                 Hono API、业务模块与数据库
│   └── web/                 Vue 单页应用
├── packages/
│   ├── shared/              跨端领域类型和 API 契约
│   └── ui/                  无业务状态的设计系统组件
├── docs/
│   ├── architecture/        架构事实
│   ├── design/              UI 设计规格
│   ├── guides/              环境与操作指南
│   ├── product/             产品边界
│   └── standards/           长期工程规则
└── pnpm-workspace.yaml      workspace 与依赖 catalog
```

## 3. 后端结构

```text
apps/api/src/
├── app.ts                   Hono 中间件与应用创建
├── index.ts                 进程启动入口
├── config/
│   └── environment.ts       .env 加载及运行时配置读取
├── db/
│   ├── index.ts             PostgreSQL / Drizzle 连接
│   └── schema/              按数据领域拆分的 schema
├── modules/
│   ├── ai/                  Provider、上下文、提示词、知识检索
│   ├── automation/          自动运行、写作任务、变更集与章后处理
│   ├── character/           人物、关系与人物弧光
│   ├── narrative/           冲突、伏笔、事件与健康指标
│   ├── project/             项目与导出
│   ├── story/               故事圣经、卷幕章、场景与版本
│   └── index.ts             唯一 HTTP 模块组合入口
├── shared/
│   ├── http/                统一响应结构
│   ├── utils/               时间、ID、错误和更新字段工具
│   └── ownership.ts         跨领域项目归属校验
├── scripts/                 可维护的初始化与 seed 脚本
└── test/                    跨模块测试基础设施
```

### 后端依赖方向

```text
app/index
  → modules
    → config + db + shared
    → other domain modules (explicit imports only)
db
  → config
shared
  → db only when enforcing ownership
config
  → no domain module
```

- `modules/index.ts` 是 HTTP surface 的组合根，保持路由注册顺序显式可审查。
- 路由与其业务服务同处一个领域目录；`*.routes.ts` 只处理协议，`*.service.ts` 负责业务与数据库组合。
- 跨领域能力必须显式导入，禁止重新建立全局 `routes/` 或 `services/` 大平铺目录。
- 真正跨领域且无业务归属的逻辑才进入 `shared`，不能把领域服务包装成“工具类”。

## 4. 前端结构

```text
apps/web/src/
├── main.ts                  Vue 启动入口
├── router/                  路由声明
├── views/                   路由页面组合层
├── features/
│   ├── automation-cockpit/  驾驶舱 API、组件、composable、store
│   ├── projects/            项目 API、标签与 store
│   └── settings/            配置 API、组件与 composable
├── shared/
│   ├── api/                 通用 HTTP client
│   └── utils/               无 Vue 状态的纯工具
├── components/              App shell 级共享组件
└── styles/                  全局样式
```

### 前端依赖方向

```text
router → views → features → shared
                    ↓
              packages/ui
                    ↓
            packages/shared
```

- route view 只组合 feature 与处理路由参数。
- feature 内部共同维护组件、API、composable 和 Pinia store。
- `shared` 不导入任何 feature；跨 feature 复用必须是无业务状态的基础能力。
- `packages/ui` 不访问业务 API，`packages/shared` 不依赖 Vue、Hono 或数据库。

## 5. 请求与自动写作链路

普通请求：

```text
Vue component
  → feature composable/store
  → feature API
  → shared HTTP client
  → Hono route
  → domain service
  → Drizzle/PostgreSQL
```

自动写作主链：

```text
autonomous run
  → writing job
  → AI context + narrative control
  → outline/draft generation
  → consistency guard
  → change set + automatic decision
  → repair / apply / isolate / skip
  → postprocess
  → narrative ledgers + health metrics
  → cockpit projection
```

所有写回都必须保留变更集、风险决策、任务步骤和结果状态，不能把失败、跳过或隔离伪装为完成。

## 6. 配置边界

- `.env` 是本地运行输入，不提交版本库。
- `.env.example` 是支持变量的唯一清单。
- `apps/api/src/config/environment.ts` 是运行时代码读取环境变量的唯一入口。
- `TEST_DATABASE_URL` 由 Vitest 测试启动器单独管理，只接受 `_test` 结尾数据库。
- Drizzle、API 启动和 pgvector 初始化复用同一个数据库 URL 解析逻辑。

## 7. 契约、数据库与测试

- 跨端模型和输入输出放在 `packages/shared`。
- schema 放在 `apps/api/src/db/schema`；迁移历史放在 `apps/api/drizzle`，不得作为旧文件清理。
- 单元测试与被测模块相邻；架构边界由各应用的 `src/architecture.test.ts` 自动验证；跨 feature 测试放在 `features` 根；API HTTP 集成测试保留在 `src/app.integration.test.ts`。
- 全仓验收执行 `pnpm check`，覆盖率门禁执行 `pnpm test:coverage`。

## 8. 架构非目标

- 不恢复旧式多页面 CRUD 工作台。
- 不引入只有静态方法的“万能工具类”；优先使用职责单一的纯函数模块。
- 不为了目录整齐复制服务或契约。
- 不在本轮结构整理中改变 HTTP 路径、数据库 schema 或产品行为。

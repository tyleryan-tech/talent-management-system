# Talent Hub Go Server

Go 语言实现的人才管理系统后端 API，作为主数据源替代 Node.js 后端。

## 功能

- RESTful API（完全兼容现有前端 `serverSync.js`）
- JWT 认证 + 基于角色的访问控制
- SQLite 数据持久化 + 乐观并发版本控制
- WebSocket 实时推送
- CORS 白名单 + 请求限流
- 增量 Patch 与全量 PUT 双模式写入
- 按角色裁剪工作区数据（HRBP 全量/经理仅下属）

## 前置条件

- Go 1.22+
- GCC（SQLite CGO 编译需要，Windows 可安装 [TDM-GCC](https://jmeubank.github.io/tdm-gcc/)）

## 快速开始

```bash
# 1. 进入目录
cd go-server

# 2. 下载依赖
go mod tidy

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env，至少设置 JWT_SECRET

# 4. 运行
go run .
```

## API 端点

| Method | Path                         | 说明               |
|--------|------------------------------|--------------------|
| GET    | /health                      | 健康检查           |
| GET    | /api/health                  | API 健康检查       |
| POST   | /api/auth/login              | 登录               |
| GET    | /api/auth/me                 | 获取当前用户       |
| GET    | /api/product-lines           | 产品线列表         |
| POST   | /api/product-lines           | 创建产品线 (HRBP)  |
| DELETE | /api/product-lines/:id       | 删除产品线 (HRBP)  |
| GET    | /api/workspace/:lineId       | 获取工作区         |
| POST   | /api/workspace/:lineId/patch | 增量更新工作区     |
| PUT    | /api/workspace/:lineId       | 全量覆盖工作区     |
| WS     | /ws?token=JWT                | WebSocket 实时推送 |

## Docker 部署

```bash
docker build -t talent-hub-go .
docker run -p 3000:3000 -e JWT_SECRET=your-secret talent-hub-go
```

## 环境变量

| 变量         | 默认值                | 说明                  |
|-------------|----------------------|----------------------|
| PORT        | 3000                 | 监听端口              |
| DB_PATH     | data/talent-hub.db   | SQLite 数据库路径     |
| JWT_SECRET  | (必填)               | JWT 签名密钥          |
| CORS_ORIGINS| (空=允许所有)         | 逗号分隔的允许来源    |

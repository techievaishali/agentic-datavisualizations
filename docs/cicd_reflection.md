# CI/CD Reflection Report

## 1. Definition and relevance

Continuous Integration (CI) is the automated process of building and testing code changes frequently. Continuous Deployment (CD) extends automation toward releasing validated changes to target environments. Together, CI/CD improves quality, release speed, and reliability in modern software engineering.

## 2. Tools and technologies

- GitHub Actions: native workflow automation for GitHub repositories.
- Jenkins: highly extensible CI/CD server for custom pipelines.
- GitLab CI/CD: integrated source and pipeline platform.
- Azure DevOps: enterprise pipeline and release tooling.

## 3. Application to this project

Pipeline stages:

1. Backend dependency install.
2. Execute backend tests.
3. Frontend dependency install.
4. Execute frontend build.

Outcomes:

- Early detection of integration issues.
- Repeatable quality checks.
- Reduced manual deployment risk.

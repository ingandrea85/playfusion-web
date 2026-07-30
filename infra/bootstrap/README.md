# CI/CD bootstrap — GitHub OIDC deploy role (S0.13)

One-time manual AWS setup that lets the GitHub Actions workflows
(`.github/workflows/deploy-stage.yml`, `deploy-prod.yml`) deploy the CDK app with
**no long-lived keys** — they assume an IAM role via GitHub→AWS OIDC.

> **Prerequisite / user action.** These steps need AWS **admin** credentials and are run
> once per AWS account. They are intentionally not automated in CI (chicken-and-egg: this
> role is what CI uses). Region: `eu-south-1`.

## Steps

1. **Authenticate** with admin credentials for the target account:
   ```bash
   aws sts get-caller-identity      # confirm the right account
   ```

2. **Bootstrap CDK** in the account/region (creates the `cdk-*` roles the deploy role assumes):
   ```bash
   npx cdk bootstrap aws://<ACCOUNT_ID>/eu-south-1
   ```

3. **Create the OIDC provider + deploy role** from the template:
   ```bash
   aws cloudformation deploy \
     --template-file infra/bootstrap/github-oidc.yaml \
     --stack-name playfusion2-gha-oidc \
     --capabilities CAPABILITY_NAMED_IAM \
     --region eu-south-1
   # If the GitHub OIDC provider already exists in the account, add:
   #   --parameter-overrides CreateOidcProvider=false
   ```

4. **Read the role ARN** and set it as a GitHub **repository variable** named
   `AWS_DEPLOY_ROLE_ARN` (Settings → Secrets and variables → Actions → Variables):
   ```bash
   aws cloudformation describe-stacks --stack-name playfusion2-gha-oidc \
     --query "Stacks[0].Outputs[?OutputKey=='DeployRoleArn'].OutputValue" --output text
   ```

5. **Create the `stage` branch** (the collaudo deploy trigger):
   ```bash
   git switch -c stage main && git push -u origin stage
   ```

## Trust model

The deploy role (`playfusion2-gha-deploy`) trusts only:

- `repo:ingandrea85/playfusion-web:ref:refs/heads/stage` — the collaudo (`stg`) deploys, and
- `repo:ingandrea85/playfusion-web:ref:refs/tags/v*` — the produzione (`pr`) deploys.

It is least-privilege: it may only `sts:AssumeRole` the `cdk-*` bootstrap roles (which hold
the actual deploy permissions) and read CloudFormation stack state. A single account can
host both envs; for stricter isolation deploy the template in two separate accounts and set
`AWS_DEPLOY_ROLE_ARN` per environment.

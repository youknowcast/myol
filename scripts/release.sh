#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_PATHS=()

cleanup() {
  local path
  for path in "${TMP_PATHS[@]-}"; do
    if [ -e "$path" ]; then
      rm -rf "$path"
    fi
  done
}

register_tmp_path() {
  TMP_PATHS+=("$1")
}

trap cleanup EXIT

require_command() {
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
}

require_env() {
  local key="$1"
  if [ -z "${!key:-}" ]; then
    echo "Missing required environment variable: $key" >&2
    exit 1
  fi
}

ensure_bucket() {
  local bucket="$1"
  if aws s3api head-bucket --bucket "$bucket" >/dev/null 2>&1; then
    return
  fi

  if [ "$AWS_REGION_RESOLVED" = "us-east-1" ]; then
    aws s3api create-bucket --bucket "$bucket"
    return
  fi

  aws s3api create-bucket \
    --bucket "$bucket" \
    --create-bucket-configuration "LocationConstraint=${AWS_REGION_RESOLVED}" \
    --region "$AWS_REGION_RESOLVED"
}

ensure_origin_access_control() {
  local oac_name="myol-${MYOL_WEB_BUCKET}-oac"
  local existing_id

  existing_id="$(aws cloudfront list-origin-access-controls \
    --query "OriginAccessControlList.Items[?Name=='${oac_name}'].Id | [0]" \
    --output text 2>/dev/null || true)"

  if [ -n "$existing_id" ] && [ "$existing_id" != "None" ]; then
    printf '%s' "$existing_id"
    return
  fi

  aws cloudfront create-origin-access-control \
    --origin-access-control-config "Name=${oac_name},Description=myol release managed,SigningProtocol=sigv4,SigningBehavior=always,OriginAccessControlOriginType=s3" \
    --query 'OriginAccessControl.Id' \
    --output text
}

ensure_cloudfront_binding() {
  local dist_json
  local updated_cfg
  local target_domain
  local origin_id
  local oac_id
  local etag
  local account_id
  local distribution_arn
  local policy_path
  local current_policy_path
  local merged_policy_path
  local origin_exists
  local generated_origin_id

  dist_json="$(mktemp -t myol-cf-dist.XXXXXX.json)"
  updated_cfg="$(mktemp -t myol-cf-updated.XXXXXX.json)"
  policy_path="$(mktemp -t myol-s3-policy.XXXXXX.json)"
  current_policy_path="$(mktemp -t myol-s3-policy-current.XXXXXX.json)"
  merged_policy_path="$(mktemp -t myol-s3-policy-merged.XXXXXX.json)"
  register_tmp_path "$dist_json"
  register_tmp_path "$updated_cfg"
  register_tmp_path "$policy_path"
  register_tmp_path "$current_policy_path"
  register_tmp_path "$merged_policy_path"

  aws cloudfront get-distribution-config \
    --id "$MYOL_CLOUDFRONT_DISTRIBUTION_ID" \
    --output json > "$dist_json"

  target_domain="${MYOL_WEB_BUCKET}.s3.${AWS_REGION_RESOLVED}.amazonaws.com"

  origin_id="$(jq -r \
    --arg domain_regional "$target_domain" \
    --arg domain_legacy "${MYOL_WEB_BUCKET}.s3.amazonaws.com" \
    --arg frontend_host "$MYOL_FRONTEND_HOST_LOWER" \
    '.DistributionConfig.Origins.Items
    | map(select(
        .DomainName == $domain_regional
        or .DomainName == $domain_legacy
        or ((.Id // "") | ascii_downcase | contains($frontend_host))
        or ((.DomainName // "") | ascii_downcase | contains($frontend_host))
      ))
    | .[0].Id // empty' \
    "$dist_json")"

  if [ -n "$origin_id" ]; then
    origin_exists="true"
  else
    origin_exists="false"
  fi

  if [ "$origin_exists" = "false" ]; then
    generated_origin_id="myol-${MYOL_FRONTEND_HOST_LOWER//[^a-z0-9-]/-}"
    origin_id="$generated_origin_id"
  fi

  oac_id="$(ensure_origin_access_control)"

  if [ "$origin_exists" = "true" ]; then
    jq \
      --arg origin_id "$origin_id" \
      --arg oac_id "$oac_id" \
      --arg target_domain "$target_domain" \
      --arg origin_path "$MYOL_CLOUDFRONT_ORIGIN_PATH" \
      '.DistributionConfig
      | .Origins.Items = (
          .Origins.Items
          | map(
              if .Id == $origin_id
              then (
                .DomainName = $target_domain
                | if ($origin_path | length) > 0
                  then .OriginPath = $origin_path
                  else .
                  end
                | .OriginAccessControlId = $oac_id
                | .S3OriginConfig = { OriginAccessIdentity: "" }
                | del(.CustomOriginConfig)
              )
              else .
              end
            )
        )
      | .Origins.Quantity = (.Origins.Items | length)' \
      "$dist_json" > "$updated_cfg"
  else
    jq \
      --arg origin_id "$origin_id" \
      --arg oac_id "$oac_id" \
      --arg target_domain "$target_domain" \
      --arg origin_path "$MYOL_CLOUDFRONT_ORIGIN_PATH" \
      '.DistributionConfig
      | .Origins.Items += [
          {
            Id: $origin_id,
            DomainName: $target_domain,
            OriginPath: $origin_path,
            CustomHeaders: { Quantity: 0 },
            S3OriginConfig: { OriginAccessIdentity: "" },
            ConnectionAttempts: 3,
            ConnectionTimeout: 10,
            OriginAccessControlId: $oac_id,
            OriginShield: { Enabled: false }
          }
        ]
      | .Origins.Quantity = (.Origins.Items | length)' \
      "$dist_json" > "$updated_cfg"
  fi

  etag="$(jq -r '.ETag' "$dist_json")"

  aws cloudfront update-distribution \
    --id "$MYOL_CLOUDFRONT_DISTRIBUTION_ID" \
    --if-match "$etag" \
    --distribution-config "file://$updated_cfg" >/dev/null

  aws cloudfront wait distribution-deployed --id "$MYOL_CLOUDFRONT_DISTRIBUTION_ID"

  local target_count
  target_count="$(jq -r \
    --arg origin_id "$origin_id" \
    '(
      if .DefaultCacheBehavior.TargetOriginId == $origin_id then 1 else 0 end
    ) + (
      [(.CacheBehaviors.Items // [])[] | select(.TargetOriginId == $origin_id)] | length
    )' \
    "$updated_cfg")"

  if [ "$target_count" = "0" ]; then
    echo "Warning: origin '${origin_id}' is not used by any cache behavior." >&2
    echo "Update CloudFront cache behavior target origin if needed." >&2
  fi

  if [ -z "$origin_id" ]; then
    echo "Failed to determine CloudFront origin id for myol." >&2
    exit 1
  fi

  account_id="$(aws sts get-caller-identity --query Account --output text)"
  distribution_arn="arn:aws:cloudfront::${account_id}:distribution/${MYOL_CLOUDFRONT_DISTRIBUTION_ID}"

  if aws s3api get-bucket-policy --bucket "$MYOL_WEB_BUCKET" --query Policy --output text >/dev/null 2>&1; then
    aws s3api get-bucket-policy --bucket "$MYOL_WEB_BUCKET" --query Policy --output text > "$current_policy_path"
  else
    printf '%s\n' '{"Version":"2012-10-17","Statement":[]}' > "$current_policy_path"
  fi

  cat > "$policy_path" <<EOF
{
  "Sid": "AllowCloudFrontRead",
  "Effect": "Allow",
  "Principal": {
    "Service": "cloudfront.amazonaws.com"
  },
  "Action": "s3:GetObject",
  "Resource": "arn:aws:s3:::${MYOL_WEB_BUCKET}/*",
  "Condition": {
    "StringEquals": {
      "AWS:SourceArn": "${distribution_arn}"
    }
  }
}
EOF

  jq \
    --slurpfile desired "$policy_path" \
    '.Version = (.Version // "2012-10-17")
    | .Statement = (
        (
          if (.Statement | type) == "array" then .Statement
          elif (.Statement | type) == "null" then []
          else [ .Statement ]
          end
          | map(select(.Sid != "AllowCloudFrontRead"))
        ) + $desired
      )' \
    "$current_policy_path" > "$merged_policy_path"

  aws s3api put-bucket-policy \
    --bucket "$MYOL_WEB_BUCKET" \
    --policy "file://$merged_policy_path"
}

ensure_lambda_function() {
  local function_exists="false"

  if aws lambda get-function --function-name "$MYOL_LAMBDA_FUNCTION_NAME" --region "$AWS_REGION_RESOLVED" >/dev/null 2>&1; then
    function_exists="true"
  fi

  npm --prefix "$ROOT_DIR/lambda/presigned-url" install
  npm --prefix "$ROOT_DIR/lambda/presigned-url" run build

  local temp_dir
  local zip_path
  temp_dir="$(mktemp -d -t myol-lambda.XXXXXX)"
  register_tmp_path "$temp_dir"
  zip_path="$temp_dir/lambda.zip"
  (cd "$ROOT_DIR/lambda/presigned-url" && zip -q "$zip_path" dist/index.js)

  if [ "$function_exists" = "true" ]; then
    aws lambda update-function-configuration \
      --function-name "$MYOL_LAMBDA_FUNCTION_NAME" \
      --runtime nodejs22.x \
      --handler dist/index.handler \
      --memory-size 128 \
      --timeout 10 \
      --role "$MYOL_LAMBDA_ROLE_ARN" \
      --environment "Variables={S3_BUCKET=$MYOL_DATA_BUCKET}" \
      --region "$AWS_REGION_RESOLVED" >/dev/null

    aws lambda wait function-updated \
      --function-name "$MYOL_LAMBDA_FUNCTION_NAME" \
      --region "$AWS_REGION_RESOLVED"

    aws lambda update-function-code \
      --function-name "$MYOL_LAMBDA_FUNCTION_NAME" \
      --zip-file "fileb://$zip_path" \
      --region "$AWS_REGION_RESOLVED" >/dev/null
  else
    aws lambda create-function \
      --function-name "$MYOL_LAMBDA_FUNCTION_NAME" \
      --runtime nodejs22.x \
      --handler dist/index.handler \
      --memory-size 128 \
      --timeout 10 \
      --role "$MYOL_LAMBDA_ROLE_ARN" \
      --environment "Variables={S3_BUCKET=$MYOL_DATA_BUCKET}" \
      --zip-file "fileb://$zip_path" \
      --region "$AWS_REGION_RESOLVED" >/dev/null
  fi

  aws lambda wait function-active \
    --function-name "$MYOL_LAMBDA_FUNCTION_NAME" \
    --region "$AWS_REGION_RESOLVED"
}

ensure_function_url() {
  local cors
  cors="AllowOrigins=${MYOL_FRONTEND_ORIGIN},AllowMethods=POST,AllowHeaders=Content-Type"

  if aws lambda get-function-url-config --function-name "$MYOL_LAMBDA_FUNCTION_NAME" --region "$AWS_REGION_RESOLVED" >/dev/null 2>&1; then
    aws lambda update-function-url-config \
      --function-name "$MYOL_LAMBDA_FUNCTION_NAME" \
      --auth-type NONE \
      --cors "$cors" \
      --region "$AWS_REGION_RESOLVED" >/dev/null
  else
    aws lambda create-function-url-config \
      --function-name "$MYOL_LAMBDA_FUNCTION_NAME" \
      --auth-type NONE \
      --cors "$cors" \
      --region "$AWS_REGION_RESOLVED" >/dev/null
  fi

  aws lambda add-permission \
    --function-name "$MYOL_LAMBDA_FUNCTION_NAME" \
    --statement-id FunctionURLAllowPublicAccess \
    --action lambda:InvokeFunctionUrl \
    --principal "*" \
    --function-url-auth-type NONE \
    --region "$AWS_REGION_RESOLVED" >/dev/null 2>&1 || true

  aws lambda add-permission \
    --function-name "$MYOL_LAMBDA_FUNCTION_NAME" \
    --statement-id FunctionURLAllowInvokeAction \
    --action lambda:InvokeFunction \
    --principal "*" \
    --invoked-via-function-url \
    --region "$AWS_REGION_RESOLVED" >/dev/null 2>&1 || true
}

configure_data_bucket_cors() {
  local cors_path
  cors_path="$(mktemp -t myol-data-cors.XXXXXX.json)"
  register_tmp_path "$cors_path"

  cat > "$cors_path" <<EOF
{
  "CORSRules": [
    {
      "AllowedOrigins": [
        "${MYOL_FRONTEND_ORIGIN}"
      ],
      "AllowedMethods": [
        "GET",
        "PUT",
        "HEAD"
      ],
      "AllowedHeaders": [
        "*"
      ],
      "ExposeHeaders": [
        "ETag"
      ],
      "MaxAgeSeconds": 3600
    }
  ]
}
EOF

  aws s3api put-bucket-cors \
    --bucket "$MYOL_DATA_BUCKET" \
    --cors-configuration "file://$cors_path" \
    --region "$AWS_REGION_RESOLVED"
}

deploy_frontend() {
  npm --prefix "$ROOT_DIR" install
  npm --prefix "$ROOT_DIR" run build
  aws s3 sync "$ROOT_DIR/dist/" "s3://$MYOL_WEB_BUCKET/" --delete --region "$AWS_REGION_RESOLVED"

  aws cloudfront create-invalidation \
    --distribution-id "$MYOL_CLOUDFRONT_DISTRIBUTION_ID" \
    --paths '/*' >/dev/null
}

require_command aws
require_command npm
require_command zip
require_command jq

AWS_REGION_RESOLVED="${MYOL_AWS_REGION:-${AWS_REGION:-${AWS_DEFAULT_REGION:-}}}"
if [ -z "$AWS_REGION_RESOLVED" ]; then
  echo "Set MYOL_AWS_REGION or AWS_REGION/AWS_DEFAULT_REGION." >&2
  exit 1
fi

require_env MYOL_WEB_BUCKET
require_env MYOL_DATA_BUCKET
require_env MYOL_FRONTEND_ORIGIN
require_env MYOL_LAMBDA_FUNCTION_NAME
require_env MYOL_LAMBDA_ROLE_ARN
require_env MYOL_CLOUDFRONT_DISTRIBUTION_ID

MYOL_FRONTEND_HOST="${MYOL_FRONTEND_ORIGIN#http://}"
MYOL_FRONTEND_HOST="${MYOL_FRONTEND_HOST#https://}"
MYOL_FRONTEND_HOST="${MYOL_FRONTEND_HOST%%/*}"
MYOL_FRONTEND_HOST="${MYOL_FRONTEND_HOST%%:*}"
MYOL_FRONTEND_HOST_LOWER="$(printf '%s' "$MYOL_FRONTEND_HOST" | tr '[:upper:]' '[:lower:]')"
MYOL_CLOUDFRONT_ORIGIN_PATH="${MYOL_CLOUDFRONT_ORIGIN_PATH:-}"

if [ -n "$MYOL_CLOUDFRONT_ORIGIN_PATH" ] && [ "${MYOL_CLOUDFRONT_ORIGIN_PATH#/}" = "$MYOL_CLOUDFRONT_ORIGIN_PATH" ]; then
  MYOL_CLOUDFRONT_ORIGIN_PATH="/${MYOL_CLOUDFRONT_ORIGIN_PATH}"
fi

if [ -z "$MYOL_FRONTEND_HOST_LOWER" ]; then
  echo "Could not parse host from MYOL_FRONTEND_ORIGIN: $MYOL_FRONTEND_ORIGIN" >&2
  exit 1
fi

echo "[myol] Ensuring S3 buckets"
ensure_bucket "$MYOL_WEB_BUCKET"
ensure_bucket "$MYOL_DATA_BUCKET"

echo "[myol] Configuring data bucket CORS"
configure_data_bucket_cors

echo "[myol] Ensuring CloudFront <-> S3 binding"
ensure_cloudfront_binding

echo "[myol] Deploying Lambda function"
ensure_lambda_function

echo "[myol] Configuring Lambda Function URL"
ensure_function_url

echo "[myol] Building and deploying frontend"
deploy_frontend

echo "[myol] Release completed"
aws lambda get-function-url-config \
  --function-name "$MYOL_LAMBDA_FUNCTION_NAME" \
  --region "$AWS_REGION_RESOLVED" \
  --query 'FunctionUrl' \
  --output text

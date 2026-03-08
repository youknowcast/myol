#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_PATHS=()
MYOL_CLOUDFRONT_DISTRIBUTION_ID="${MYOL_CLOUDFRONT_DISTRIBUTION_ID:-}"

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
    aws s3api create-bucket --bucket "$bucket" >/dev/null
  else
    aws s3api create-bucket \
      --bucket "$bucket" \
      --create-bucket-configuration "LocationConstraint=${AWS_REGION_RESOLVED}" \
      --region "$AWS_REGION_RESOLVED" >/dev/null
  fi
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

ensure_cloudfront_distribution() {
  local oac_id
  local origin_id="myol-s3-origin"
  local target_domain="${MYOL_WEB_BUCKET}.s3.${AWS_REGION_RESOLVED}.amazonaws.com"
  local create_cfg
  local dist_json
  local update_cfg
  local etag

  oac_id="$(ensure_origin_access_control)"

  if [ -z "$MYOL_CLOUDFRONT_DISTRIBUTION_ID" ]; then
    create_cfg="$(mktemp -t myol-cf-create.XXXXXX.json)"
    register_tmp_path "$create_cfg"

    jq -n \
      --arg caller_ref "myol-$(date +%s)" \
      --arg frontend_host "$MYOL_FRONTEND_HOST_LOWER" \
      --arg origin_id "$origin_id" \
      --arg target_domain "$target_domain" \
      --arg oac_id "$oac_id" \
      --arg cert_arn "$MYOL_ACM_CERT_ARN" \
      --arg price_class "$MYOL_CLOUDFRONT_PRICE_CLASS" \
      '{
        CallerReference: $caller_ref,
        Comment: "myol release managed",
        Enabled: true,
        HttpVersion: "http2and3",
        PriceClass: $price_class,
        Aliases: {
          Quantity: 1,
          Items: [$frontend_host]
        },
        Origins: {
          Quantity: 1,
          Items: [
            {
              Id: $origin_id,
              DomainName: $target_domain,
              OriginPath: "",
              CustomHeaders: { Quantity: 0 },
              S3OriginConfig: { OriginAccessIdentity: "" },
              ConnectionAttempts: 3,
              ConnectionTimeout: 10,
              OriginAccessControlId: $oac_id,
              OriginShield: { Enabled: false }
            }
          ]
        },
        DefaultRootObject: "index.html",
        DefaultCacheBehavior: {
          TargetOriginId: $origin_id,
          ViewerProtocolPolicy: "redirect-to-https",
          Compress: true,
          AllowedMethods: {
            Quantity: 2,
            Items: ["GET", "HEAD"],
            CachedMethods: {
              Quantity: 2,
              Items: ["GET", "HEAD"]
            }
          },
          CachePolicyId: "658327ea-f89d-4fab-a63d-7e88639e58f6"
        },
        CustomErrorResponses: {
          Quantity: 2,
          Items: [
            {
              ErrorCode: 403,
              ResponsePagePath: "/index.html",
              ResponseCode: "200",
              ErrorCachingMinTTL: 0
            },
            {
              ErrorCode: 404,
              ResponsePagePath: "/index.html",
              ResponseCode: "200",
              ErrorCachingMinTTL: 0
            }
          ]
        },
        ViewerCertificate: {
          ACMCertificateArn: $cert_arn,
          SSLSupportMethod: "sni-only",
          MinimumProtocolVersion: "TLSv1.2_2021"
        }
      }' > "$create_cfg"

    MYOL_CLOUDFRONT_DISTRIBUTION_ID="$(aws cloudfront create-distribution \
      --distribution-config "file://$create_cfg" \
      --query 'Distribution.Id' \
      --output text)"
  else
    dist_json="$(mktemp -t myol-cf-current.XXXXXX.json)"
    update_cfg="$(mktemp -t myol-cf-update.XXXXXX.json)"
    register_tmp_path "$dist_json"
    register_tmp_path "$update_cfg"

    aws cloudfront get-distribution-config \
      --id "$MYOL_CLOUDFRONT_DISTRIBUTION_ID" \
      --output json > "$dist_json"

    jq \
      --arg frontend_host "$MYOL_FRONTEND_HOST_LOWER" \
      --arg origin_id "$origin_id" \
      --arg target_domain "$target_domain" \
      --arg oac_id "$oac_id" \
      --arg cert_arn "$MYOL_ACM_CERT_ARN" \
      --arg price_class "$MYOL_CLOUDFRONT_PRICE_CLASS" \
      '.DistributionConfig
      | .Comment = "myol release managed"
      | .PriceClass = $price_class
      | .Aliases = { Quantity: 1, Items: [$frontend_host] }
      | .Origins = {
          Quantity: 1,
          Items: [
            {
              Id: $origin_id,
              DomainName: $target_domain,
              OriginPath: "",
              CustomHeaders: { Quantity: 0 },
              S3OriginConfig: { OriginAccessIdentity: "" },
              ConnectionAttempts: 3,
              ConnectionTimeout: 10,
              OriginAccessControlId: $oac_id,
              OriginShield: { Enabled: false }
            }
          ]
        }
      | .DefaultRootObject = "index.html"
      | .DefaultCacheBehavior.TargetOriginId = $origin_id
      | .DefaultCacheBehavior.ViewerProtocolPolicy = "redirect-to-https"
      | .DefaultCacheBehavior.Compress = true
      | .DefaultCacheBehavior.AllowedMethods = {
          Quantity: 2,
          Items: ["GET", "HEAD"],
          CachedMethods: {
            Quantity: 2,
            Items: ["GET", "HEAD"]
          }
        }
      | .DefaultCacheBehavior.CachePolicyId = "658327ea-f89d-4fab-a63d-7e88639e58f6"
      | .CustomErrorResponses = {
          Quantity: 2,
          Items: [
            {
              ErrorCode: 403,
              ResponsePagePath: "/index.html",
              ResponseCode: "200",
              ErrorCachingMinTTL: 0
            },
            {
              ErrorCode: 404,
              ResponsePagePath: "/index.html",
              ResponseCode: "200",
              ErrorCachingMinTTL: 0
            }
          ]
        }
      | .ViewerCertificate = {
          ACMCertificateArn: $cert_arn,
          SSLSupportMethod: "sni-only",
          MinimumProtocolVersion: "TLSv1.2_2021"
        }
      ' "$dist_json" > "$update_cfg"

    etag="$(jq -r '.ETag' "$dist_json")"

    aws cloudfront update-distribution \
      --id "$MYOL_CLOUDFRONT_DISTRIBUTION_ID" \
      --if-match "$etag" \
      --distribution-config "file://$update_cfg" >/dev/null
  fi

  aws cloudfront wait distribution-deployed --id "$MYOL_CLOUDFRONT_DISTRIBUTION_ID"
}

ensure_web_bucket_policy() {
  local account_id
  local distribution_arn
  local policy_path

  account_id="$(aws sts get-caller-identity --query Account --output text)"
  distribution_arn="arn:aws:cloudfront::${account_id}:distribution/${MYOL_CLOUDFRONT_DISTRIBUTION_ID}"

  policy_path="$(mktemp -t myol-web-policy.XXXXXX.json)"
  register_tmp_path "$policy_path"

  cat > "$policy_path" <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
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
  ]
}
EOF

  aws s3api put-bucket-policy \
    --bucket "$MYOL_WEB_BUCKET" \
    --policy "file://$policy_path"
}

ensure_lambda_function() {
  local function_exists="false"
  local temp_dir
  local zip_path

  if aws lambda get-function --function-name "$MYOL_LAMBDA_FUNCTION_NAME" --region "$AWS_REGION_RESOLVED" >/dev/null 2>&1; then
    function_exists="true"
  fi

  npm --prefix "$ROOT_DIR/lambda/presigned-url" install
  npm --prefix "$ROOT_DIR/lambda/presigned-url" run build

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
require_env MYOL_ACM_CERT_ARN

MYOL_CLOUDFRONT_PRICE_CLASS="${MYOL_CLOUDFRONT_PRICE_CLASS:-PriceClass_200}"

MYOL_FRONTEND_HOST="${MYOL_FRONTEND_ORIGIN#http://}"
MYOL_FRONTEND_HOST="${MYOL_FRONTEND_HOST#https://}"
MYOL_FRONTEND_HOST="${MYOL_FRONTEND_HOST%%/*}"
MYOL_FRONTEND_HOST="${MYOL_FRONTEND_HOST%%:*}"
MYOL_FRONTEND_HOST_LOWER="$(printf '%s' "$MYOL_FRONTEND_HOST" | tr '[:upper:]' '[:lower:]')"

if [ -z "$MYOL_FRONTEND_HOST_LOWER" ]; then
  echo "Could not parse host from MYOL_FRONTEND_ORIGIN: $MYOL_FRONTEND_ORIGIN" >&2
  exit 1
fi

echo "[myol] Ensuring S3 buckets"
ensure_bucket "$MYOL_WEB_BUCKET"
ensure_bucket "$MYOL_DATA_BUCKET"

echo "[myol] Configuring data bucket CORS"
configure_data_bucket_cors

echo "[myol] Ensuring CloudFront distribution"
ensure_cloudfront_distribution

echo "[myol] Configuring web bucket policy"
ensure_web_bucket_policy

echo "[myol] Deploying Lambda function"
ensure_lambda_function

echo "[myol] Configuring Lambda Function URL"
ensure_function_url

echo "[myol] Building and deploying frontend"
deploy_frontend

echo "[myol] Release completed"
echo "CloudFront Distribution ID: $MYOL_CLOUDFRONT_DISTRIBUTION_ID"
aws cloudfront get-distribution \
  --id "$MYOL_CLOUDFRONT_DISTRIBUTION_ID" \
  --query 'Distribution.DomainName' \
  --output text

echo "Lambda Function URL:"
aws lambda get-function-url-config \
  --function-name "$MYOL_LAMBDA_FUNCTION_NAME" \
  --region "$AWS_REGION_RESOLVED" \
  --query 'FunctionUrl' \
  --output text

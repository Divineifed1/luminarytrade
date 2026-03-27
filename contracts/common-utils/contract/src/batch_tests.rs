#![cfg(test)]

use crate::batch::*;
use soroban_sdk::{symbol_short, testutils::Address as _, Address, Bytes, Env, Symbol, Vec};

fn make_env() -> Env {
    let env = Env::default();
    env.mock_all_auths();
    env
}

fn report_op(env: &Env, agent_id: Symbol, score: u32) -> BatchOperation {
    BatchOperation::Report(ReportSubmission {
        reporter: Address::generate(env),
        agent_id,
        score,
    })
}

fn score_op(env: &Env, score: u32) -> BatchOperation {
    BatchOperation::Score(ScoreCalculation {
        account_id: Address::generate(env),
        score,
    })
}

fn metadata_op(env: &Env) -> BatchOperation {
    BatchOperation::Metadata(MetadataUpdate {
        agent: Address::generate(env),
        json_cid: Bytes::from_slice(env, b"QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG"),
        model_hash: Bytes::from_slice(env, b"a1b2c3d4e5f6789012345678901234567890abcdef"),
    })
}

fn risk_op(env: &Env, level: u32) -> BatchOperation {
    BatchOperation::Risk(RiskEvaluation {
        agent: Address::generate(env),
        risk_level: level,
        timestamp: 1000,
    })
}

// --- Validation tests ---

#[test]
fn test_empty_batch_rejected() {
    let env = make_env();
    let ops = Vec::new(&env);
    assert_eq!(BatchValidator::validate(&ops), Err(BatchError::EmptyBatch));
}

#[test]
fn test_oversized_batch_rejected() {
    let env = make_env();
    let mut ops = Vec::new(&env);
    for _ in 0..=MAX_BATCH_SIZE {
        ops.push_back(score_op(&env, 500));
    }
    assert_eq!(
        BatchValidator::validate(&ops),
        Err(BatchError::BatchSizeExceeded)
    );
}

#[test]
fn test_invalid_report_score_rejected() {
    let env = make_env();
    let mut ops = Vec::new(&env);
    ops.push_back(report_op(&env, symbol_short!("agent_1"), 150));
    assert_eq!(
        BatchValidator::validate(&ops),
        Err(BatchError::ValidationFailed)
    );
}

#[test]
fn test_invalid_credit_score_rejected() {
    let env = make_env();
    let mut ops = Vec::new(&env);
    ops.push_back(score_op(&env, 2000));
    assert_eq!(
        BatchValidator::validate(&ops),
        Err(BatchError::ValidationFailed)
    );
}

#[test]
fn test_invalid_risk_level_rejected() {
    let env = make_env();
    let mut ops = Vec::new(&env);
    ops.push_back(risk_op(&env, 5));
    assert_eq!(
        BatchValidator::validate(&ops),
        Err(BatchError::ValidationFailed)
    );
}

#[test]
fn test_empty_metadata_rejected() {
    let env = make_env();
    let mut ops = Vec::new(&env);
    ops.push_back(BatchOperation::Metadata(MetadataUpdate {
        agent: Address::generate(&env),
        json_cid: Bytes::new(&env),
        model_hash: Bytes::from_slice(&env, b"hash"),
    }));
    assert_eq!(
        BatchValidator::validate(&ops),
        Err(BatchError::ValidationFailed)
    );
}

// --- Success scenarios ---

#[test]
fn test_single_report_batch() {
    let env = make_env();
    let mut ops = Vec::new(&env);
    ops.push_back(report_op(&env, symbol_short!("agent_1"), 85));

    let result = BatchExecutor::execute(&env, ops, RollbackStrategy::AllOrNothing).unwrap();
    assert_eq!(result.total, 1);
    assert_eq!(result.succeeded, 1);
    assert_eq!(result.failed, 0);
    assert!(!result.rolled_back);
}

#[test]
fn test_mixed_batch_success() {
    let env = make_env();
    let mut ops = Vec::new(&env);
    ops.push_back(report_op(&env, symbol_short!("agent_1"), 50));
    ops.push_back(score_op(&env, 700));
    ops.push_back(metadata_op(&env));
    ops.push_back(risk_op(&env, 2));

    let result = BatchExecutor::execute(&env, ops, RollbackStrategy::AllOrNothing).unwrap();
    assert_eq!(result.total, 4);
    assert_eq!(result.succeeded, 4);
    assert_eq!(result.failed, 0);
    assert!(!result.rolled_back);
}

#[test]
fn test_batch_at_max_size() {
    let env = make_env();
    let mut ops = Vec::new(&env);
    for i in 0..MAX_BATCH_SIZE {
        ops.push_back(score_op(&env, (i * 10) % 1000));
    }

    let result = BatchExecutor::execute(&env, ops, RollbackStrategy::Partial).unwrap();
    assert_eq!(result.total, MAX_BATCH_SIZE);
    assert_eq!(result.succeeded, MAX_BATCH_SIZE);
}

// --- Gas estimation ---

#[test]
fn test_gas_estimation_single() {
    let env = make_env();
    let mut ops = Vec::new(&env);
    ops.push_back(report_op(&env, symbol_short!("agent_1"), 50));

    let gas = GasEstimator::estimate(&ops);
    assert_eq!(gas, GAS_COST_BATCH_OVERHEAD + GAS_COST_REPORT);
}

#[test]
fn test_gas_estimation_mixed() {
    let env = make_env();
    let mut ops = Vec::new(&env);
    ops.push_back(report_op(&env, symbol_short!("agent_1"), 50));
    ops.push_back(score_op(&env, 500));
    ops.push_back(metadata_op(&env));
    ops.push_back(risk_op(&env, 1));

    let gas = GasEstimator::estimate(&ops);
    let expected =
        GAS_COST_BATCH_OVERHEAD + GAS_COST_REPORT + GAS_COST_SCORE + GAS_COST_METADATA + GAS_COST_RISK;
    assert_eq!(gas, expected);
}

#[test]
fn test_gas_savings_positive() {
    let env = make_env();
    let mut ops = Vec::new(&env);
    for _ in 0..10 {
        ops.push_back(score_op(&env, 500));
    }

    let savings = GasEstimator::savings_bps(&ops);
    // With 10 operations, overhead is shared: savings should be > 40% (4000 bps)
    assert!(savings > 3000, "Expected >30% savings, got {}bps", savings);
}

// --- Deduplication ---

#[test]
fn test_dedup_keeps_last() {
    let env = make_env();
    let account = Address::generate(&env);

    let mut ops = Vec::new(&env);
    ops.push_back(BatchOperation::Score(ScoreCalculation {
        account_id: account.clone(),
        score: 100,
    }));
    ops.push_back(BatchOperation::Score(ScoreCalculation {
        account_id: account.clone(),
        score: 200,
    }));

    let deduped = OperationDeduplicator::deduplicate(&env, ops);
    assert_eq!(deduped.len(), 1);
    if let BatchOperation::Score(s) = deduped.get(0).unwrap() {
        assert_eq!(s.score, 200);
    } else {
        panic!("Expected Score operation");
    }
}

#[test]
fn test_dedup_different_types_kept() {
    let env = make_env();
    let mut ops = Vec::new(&env);
    ops.push_back(report_op(&env, symbol_short!("agent_1"), 50));
    ops.push_back(score_op(&env, 500));

    let deduped = OperationDeduplicator::deduplicate(&env, ops);
    assert_eq!(deduped.len(), 2);
}

// --- Rollback (AllOrNothing) ---

#[test]
fn test_all_or_nothing_rollback_on_validation() {
    let env = make_env();
    let mut ops = Vec::new(&env);
    ops.push_back(report_op(&env, symbol_short!("agent_1"), 50));
    ops.push_back(report_op(&env, symbol_short!("agent_2"), 150)); // invalid score

    let result = BatchExecutor::execute(&env, ops, RollbackStrategy::AllOrNothing);
    assert_eq!(result, Err(BatchError::ValidationFailed));
}

// --- Partial strategy ---

#[test]
fn test_partial_strategy_continues_on_valid_ops() {
    let env = make_env();
    let mut ops = Vec::new(&env);
    ops.push_back(report_op(&env, symbol_short!("agent_1"), 50));
    ops.push_back(score_op(&env, 700));
    ops.push_back(risk_op(&env, 0));

    let result = BatchExecutor::execute(&env, ops, RollbackStrategy::Partial).unwrap();
    assert_eq!(result.total, 3);
    assert_eq!(result.succeeded, 3);
    assert_eq!(result.failed, 0);
    assert!(!result.rolled_back);
}

// --- Result structure ---

#[test]
fn test_result_indices_match() {
    let env = make_env();
    let mut ops = Vec::new(&env);
    ops.push_back(report_op(&env, symbol_short!("agent_1"), 30));
    ops.push_back(score_op(&env, 600));

    let result = BatchExecutor::execute(&env, ops, RollbackStrategy::AllOrNothing).unwrap();
    assert_eq!(result.results.len(), 2);

    let r0 = result.results.get(0).unwrap();
    assert_eq!(r0.index, 0);
    assert_eq!(r0.status, OperationStatus::Success);

    let r1 = result.results.get(1).unwrap();
    assert_eq!(r1.index, 1);
    assert_eq!(r1.status, OperationStatus::Success);
}

// --- Estimated gas in result ---

#[test]
fn test_batch_result_includes_gas_estimate() {
    let env = make_env();
    let mut ops = Vec::new(&env);
    ops.push_back(score_op(&env, 500));

    let result = BatchExecutor::execute(&env, ops, RollbackStrategy::AllOrNothing).unwrap();
    assert_eq!(result.estimated_gas, GAS_COST_BATCH_OVERHEAD + GAS_COST_SCORE);
}

// --- New operation types ---

fn update_score_op(env: &Env, score: u32) -> BatchOperation {
    BatchOperation::UpdateScore(ScoreUpdate {
        account_id: Address::generate(env),
        score,
    })
}

fn flag_fraud_op(env: &Env, reason_code: u32) -> BatchOperation {
    BatchOperation::FlagFraud(FraudFlag {
        account_id: Address::generate(env),
        reason_code,
    })
}

fn grant_role_op(env: &Env, role: u32) -> BatchOperation {
    BatchOperation::GrantRole(RoleGrant {
        account_id: Address::generate(env),
        role,
    })
}

fn update_oracle_op(env: &Env, price: u64) -> BatchOperation {
    BatchOperation::UpdateOracle(OracleDataUpdate {
        feed_id: symbol_short!("xlm_usd"),
        price,
        timestamp: 1_000_000,
    })
}

#[test]
fn test_update_score_valid() {
    let env = make_env();
    let mut ops = Vec::new(&env);
    ops.push_back(update_score_op(&env, 700));
    let result = BatchExecutor::execute(&env, ops, RollbackStrategy::AllOrNothing).unwrap();
    assert_eq!(result.succeeded, 1);
    assert!(!result.rolled_back);
}

#[test]
fn test_update_score_out_of_range_rejected() {
    let env = make_env();
    let mut ops = Vec::new(&env);
    ops.push_back(update_score_op(&env, 200)); // below 300
    assert_eq!(BatchValidator::validate(&ops), Err(BatchError::ValidationFailed));
}

#[test]
fn test_flag_fraud_valid() {
    let env = make_env();
    let mut ops = Vec::new(&env);
    ops.push_back(flag_fraud_op(&env, 5));
    let result = BatchExecutor::execute(&env, ops, RollbackStrategy::AllOrNothing).unwrap();
    assert_eq!(result.succeeded, 1);
}

#[test]
fn test_flag_fraud_zero_reason_rejected() {
    let env = make_env();
    let mut ops = Vec::new(&env);
    ops.push_back(flag_fraud_op(&env, 0));
    assert_eq!(BatchValidator::validate(&ops), Err(BatchError::ValidationFailed));
}

#[test]
fn test_grant_role_valid() {
    let env = make_env();
    let mut ops = Vec::new(&env);
    ops.push_back(grant_role_op(&env, 2));
    let result = BatchExecutor::execute(&env, ops, RollbackStrategy::AllOrNothing).unwrap();
    assert_eq!(result.succeeded, 1);
}

#[test]
fn test_grant_role_invalid_rejected() {
    let env = make_env();
    let mut ops = Vec::new(&env);
    ops.push_back(grant_role_op(&env, 5)); // max is 4
    assert_eq!(BatchValidator::validate(&ops), Err(BatchError::ValidationFailed));
}

#[test]
fn test_update_oracle_valid() {
    let env = make_env();
    let mut ops = Vec::new(&env);
    ops.push_back(update_oracle_op(&env, 12_500_000));
    let result = BatchExecutor::execute(&env, ops, RollbackStrategy::AllOrNothing).unwrap();
    assert_eq!(result.succeeded, 1);
}

#[test]
fn test_update_oracle_zero_price_rejected() {
    let env = make_env();
    let mut ops = Vec::new(&env);
    ops.push_back(update_oracle_op(&env, 0));
    assert_eq!(BatchValidator::validate(&ops), Err(BatchError::ValidationFailed));
}

#[test]
fn test_max_batch_size_is_100() {
    let env = make_env();
    let mut ops = Vec::new(&env);
    for _ in 0..MAX_BATCH_SIZE {
        ops.push_back(update_score_op(&env, 500));
    }
    // exactly 100 should pass
    assert!(BatchValidator::validate(&ops).is_ok());

    // 101 should fail
    ops.push_back(update_score_op(&env, 500));
    assert_eq!(BatchValidator::validate(&ops), Err(BatchError::BatchSizeExceeded));
}

#[test]
fn test_dedup_update_score_keeps_last() {
    let env = make_env();
    let account = Address::generate(&env);
    let mut ops = Vec::new(&env);
    ops.push_back(BatchOperation::UpdateScore(ScoreUpdate { account_id: account.clone(), score: 400 }));
    ops.push_back(BatchOperation::UpdateScore(ScoreUpdate { account_id: account.clone(), score: 750 }));

    let deduped = OperationDeduplicator::deduplicate(&env, ops);
    assert_eq!(deduped.len(), 1);
    if let BatchOperation::UpdateScore(s) = deduped.get(0).unwrap() {
        assert_eq!(s.score, 750);
    } else {
        panic!("Expected UpdateScore");
    }
}

#[test]
fn test_dedup_oracle_keeps_last_per_feed() {
    let env = make_env();
    let mut ops = Vec::new(&env);
    ops.push_back(BatchOperation::UpdateOracle(OracleDataUpdate {
        feed_id: symbol_short!("xlm_usd"),
        price: 100,
        timestamp: 1000,
    }));
    ops.push_back(BatchOperation::UpdateOracle(OracleDataUpdate {
        feed_id: symbol_short!("xlm_usd"),
        price: 200,
        timestamp: 2000,
    }));

    let deduped = OperationDeduplicator::deduplicate(&env, ops);
    assert_eq!(deduped.len(), 1);
    if let BatchOperation::UpdateOracle(o) = deduped.get(0).unwrap() {
        assert_eq!(o.price, 200);
    } else {
        panic!("Expected UpdateOracle");
    }
}

#[test]
fn test_mixed_new_types_batch() {
    let env = make_env();
    let mut ops = Vec::new(&env);
    ops.push_back(update_score_op(&env, 650));
    ops.push_back(flag_fraud_op(&env, 3));
    ops.push_back(grant_role_op(&env, 1));
    ops.push_back(update_oracle_op(&env, 5_000_000));

    let result = BatchExecutor::execute(&env, ops, RollbackStrategy::AllOrNothing).unwrap();
    assert_eq!(result.total, 4);
    assert_eq!(result.succeeded, 4);
    assert!(!result.rolled_back);
}

#[test]
fn test_gas_savings_new_types() {
    let env = make_env();
    let mut ops = Vec::new(&env);
    for _ in 0..10 {
        ops.push_back(update_score_op(&env, 500));
    }
    let savings = GasEstimator::savings_bps(&ops);
    assert!(savings > 3000, "Expected >30% savings, got {}bps", savings);
}

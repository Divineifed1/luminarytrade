//! Batch Operations Framework
//!
//! Supports atomic batch execution with rollback for fraud reports,
//! credit scores, agent metadata updates, and risk evaluations.
//! Reduces transaction costs by composing multiple operations into
//! a single contract invocation.

use soroban_sdk::{
    contracterror, contracttype, symbol_short, Address, Bytes, Env, Symbol, Vec,
};

use crate::error::{ContractError, ErrorCategory};

/// Maximum operations per batch
pub const MAX_BATCH_SIZE: u32 = 100;

/// Estimated base gas cost per operation type
pub const GAS_COST_REPORT: u64 = 100_000;
pub const GAS_COST_SCORE: u64 = 80_000;
pub const GAS_COST_METADATA: u64 = 120_000;
pub const GAS_COST_RISK: u64 = 90_000;
pub const GAS_COST_UPDATE_SCORE: u64 = 80_000;
pub const GAS_COST_FLAG_FRAUD: u64 = 90_000;
pub const GAS_COST_GRANT_ROLE: u64 = 70_000;
pub const GAS_COST_UPDATE_ORACLE: u64 = 85_000;
pub const GAS_COST_BATCH_OVERHEAD: u64 = 50_000;

// --- Errors (1700-1799) ---

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum BatchError {
    EmptyBatch = 1701,
    BatchSizeExceeded = 1702,
    OperationFailed = 1703,
    RollbackTriggered = 1704,
    InvalidOperation = 1705,
    DuplicateOperation = 1706,
    ValidationFailed = 1707,
    GasEstimationFailed = 1708,
}

impl ContractError for BatchError {
    fn code(&self) -> u32 {
        *self as u32
    }

    fn message(&self) -> &'static str {
        match self {
            BatchError::EmptyBatch => "Batch contains no operations",
            BatchError::BatchSizeExceeded => "Batch size exceeds maximum",
            BatchError::OperationFailed => "Batch operation failed",
            BatchError::RollbackTriggered => "Batch rollback triggered",
            BatchError::InvalidOperation => "Invalid batch operation",
            BatchError::DuplicateOperation => "Duplicate operation in batch",
            BatchError::ValidationFailed => "Batch validation failed",
            BatchError::GasEstimationFailed => "Gas estimation failed",
        }
    }

    fn category(&self) -> ErrorCategory {
        ErrorCategory::Batch
    }

    fn is_recoverable(&self) -> bool {
        matches!(
            self,
            BatchError::DuplicateOperation | BatchError::BatchSizeExceeded
        )
    }
}

// --- Rollback strategy ---

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RollbackStrategy {
    /// All operations succeed or all revert
    AllOrNothing,
    /// Execute as many as possible, skip failures
    Partial,
}

// --- Operation types ---

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReportSubmission {
    pub reporter: Address,
    pub agent_id: Symbol,
    pub score: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ScoreCalculation {
    pub account_id: Address,
    pub score: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MetadataUpdate {
    pub agent: Address,
    pub json_cid: Bytes,
    pub model_hash: Bytes,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RiskEvaluation {
    pub agent: Address,
    pub risk_level: u32,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ScoreUpdate {
    pub account_id: Address,
    pub score: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FraudFlag {
    pub account_id: Address,
    pub reason_code: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RoleGrant {
    pub account_id: Address,
    pub role: u32, // maps to acl::Role
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OracleDataUpdate {
    pub feed_id: Symbol,
    pub price: u64,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum BatchOperation {
    Report(ReportSubmission),
    Score(ScoreCalculation),
    Metadata(MetadataUpdate),
    Risk(RiskEvaluation),
    UpdateScore(ScoreUpdate),
    FlagFraud(FraudFlag),
    GrantRole(RoleGrant),
    UpdateOracle(OracleDataUpdate),
}

// --- Per-operation result ---

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum OperationStatus {
    Success,
    Failed,
    Skipped,
    RolledBack,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OperationResult {
    pub index: u32,
    pub status: OperationStatus,
    pub error_code: u32,
}

// --- Batch result ---

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BatchResult {
    pub total: u32,
    pub succeeded: u32,
    pub failed: u32,
    pub rolled_back: bool,
    pub results: Vec<OperationResult>,
    pub estimated_gas: u64,
}

// --- Gas estimator ---

pub struct GasEstimator;

impl GasEstimator {
    pub fn estimate(operations: &Vec<BatchOperation>) -> u64 {
        let mut total = GAS_COST_BATCH_OVERHEAD;
        for op in operations.iter() {
            total += match op {
                BatchOperation::Report(_) => GAS_COST_REPORT,
                BatchOperation::Score(_) => GAS_COST_SCORE,
                BatchOperation::Metadata(_) => GAS_COST_METADATA,
                BatchOperation::Risk(_) => GAS_COST_RISK,
            };
        }
        total
    }

    pub fn estimate_single(operation: &BatchOperation) -> u64 {
        match operation {
            BatchOperation::Report(_) => GAS_COST_REPORT,
            BatchOperation::Score(_) => GAS_COST_SCORE,
            BatchOperation::Metadata(_) => GAS_COST_METADATA,
            BatchOperation::Risk(_) => GAS_COST_RISK,
            BatchOperation::UpdateScore(_) => GAS_COST_UPDATE_SCORE,
            BatchOperation::FlagFraud(_) => GAS_COST_FLAG_FRAUD,
            BatchOperation::GrantRole(_) => GAS_COST_GRANT_ROLE,
            BatchOperation::UpdateOracle(_) => GAS_COST_UPDATE_ORACLE,
        }
    }

    /// Savings ratio vs individual transactions (basis points, 10000 = 100%)
    pub fn savings_bps(operations: &Vec<BatchOperation>) -> u64 {
        if operations.len() == 0 {
            return 0;
        }
        let mut individual: u64 = 0;
        for op in operations.iter() {
            individual += Self::estimate_single(&op) + GAS_COST_BATCH_OVERHEAD;
        }
        let batched = Self::estimate(operations);
        if individual == 0 {
            return 0;
        }
        ((individual - batched) * 10_000) / individual
    }
}

// --- Deduplication ---

pub struct OperationDeduplicator;

impl OperationDeduplicator {
    /// Remove duplicate operations, keeping the last occurrence.
    /// Two operations are duplicates if they target the same entity with the same type.
    pub fn deduplicate(env: &Env, operations: Vec<BatchOperation>) -> Vec<BatchOperation> {
        let mut result = Vec::new(env);
        let len = operations.len();

        for i in 0..len {
            let op = operations.get(i).unwrap();
            let mut is_dup = false;
            // Check if a later operation supersedes this one
            for j in (i + 1)..len {
                let later = operations.get(j).unwrap();
                if Self::same_target(&op, &later) {
                    is_dup = true;
                    break;
                }
            }
            if !is_dup {
                result.push_back(op);
            }
        }
        result
    }

    fn same_target(a: &BatchOperation, b: &BatchOperation) -> bool {
        match (a, b) {
            (BatchOperation::Report(ra), BatchOperation::Report(rb)) => {
                ra.agent_id == rb.agent_id && ra.reporter == rb.reporter
            }
            (BatchOperation::Score(sa), BatchOperation::Score(sb)) => {
                sa.account_id == sb.account_id
            }
            (BatchOperation::Metadata(ma), BatchOperation::Metadata(mb)) => {
                ma.agent == mb.agent
            }
            (BatchOperation::Risk(ea), BatchOperation::Risk(eb)) => ea.agent == eb.agent,
            (BatchOperation::UpdateScore(a), BatchOperation::UpdateScore(b)) => {
                a.account_id == b.account_id
            }
            (BatchOperation::FlagFraud(a), BatchOperation::FlagFraud(b)) => {
                a.account_id == b.account_id
            }
            (BatchOperation::GrantRole(a), BatchOperation::GrantRole(b)) => {
                a.account_id == b.account_id
            }
            (BatchOperation::UpdateOracle(a), BatchOperation::UpdateOracle(b)) => {
                a.feed_id == b.feed_id
            }
            _ => false,
        }
    }
}

// --- Validator ---

pub struct BatchValidator;

impl BatchValidator {
    pub fn validate(operations: &Vec<BatchOperation>) -> Result<(), BatchError> {
        if operations.len() == 0 {
            return Err(BatchError::EmptyBatch);
        }
        if operations.len() > MAX_BATCH_SIZE {
            return Err(BatchError::BatchSizeExceeded);
        }
        for op in operations.iter() {
            Self::validate_operation(&op)?;
        }
        Ok(())
    }

    fn validate_operation(op: &BatchOperation) -> Result<(), BatchError> {
        match op {
            BatchOperation::Report(r) => {
                if r.score > 100 {
                    return Err(BatchError::ValidationFailed);
                }
            }
            BatchOperation::Score(s) => {
                if s.score > 1000 {
                    return Err(BatchError::ValidationFailed);
                }
            }
            BatchOperation::Metadata(m) => {
                if m.json_cid.len() == 0 || m.model_hash.len() == 0 {
                    return Err(BatchError::ValidationFailed);
                }
            }
            BatchOperation::Risk(r) => {
                if r.risk_level > 3 {
                    return Err(BatchError::ValidationFailed);
                }
            }
            BatchOperation::UpdateScore(s) => {
                if s.score < 300 || s.score > 850 {
                    return Err(BatchError::ValidationFailed);
                }
            }
            BatchOperation::FlagFraud(f) => {
                if f.reason_code == 0 {
                    return Err(BatchError::ValidationFailed);
                }
            }
            BatchOperation::GrantRole(r) => {
                if r.role > 4 {
                    return Err(BatchError::ValidationFailed);
                }
            }
            BatchOperation::UpdateOracle(o) => {
                if o.price == 0 || o.timestamp == 0 {
                    return Err(BatchError::ValidationFailed);
                }
            }
        }
        Ok(())
    }
}

// --- Executor ---

pub struct BatchExecutor;

impl BatchExecutor {
    /// Execute a batch with the given rollback strategy.
    /// Returns a BatchResult with per-operation outcomes.
    pub fn execute(
        env: &Env,
        operations: Vec<BatchOperation>,
        strategy: RollbackStrategy,
    ) -> Result<BatchResult, BatchError> {
        BatchValidator::validate(&operations)?;

        let estimated_gas = GasEstimator::estimate(&operations);
        let total = operations.len();
        let mut results = Vec::new(env);
        let mut succeeded: u32 = 0;
        let mut failed: u32 = 0;

        env.events()
            .publish((symbol_short!("batch_st"),), total);

        for i in 0..total {
            let op = operations.get(i).unwrap();
            let outcome = Self::execute_single(env, &op);

            match outcome {
                Ok(()) => {
                    results.push_back(OperationResult {
                        index: i,
                        status: OperationStatus::Success,
                        error_code: 0,
                    });
                    succeeded += 1;
                }
                Err(code) => {
                    failed += 1;
                    match strategy {
                        RollbackStrategy::AllOrNothing => {
                            let mut rolled = Vec::new(env);
                            for r in results.iter() {
                                rolled.push_back(OperationResult {
                                    index: r.index,
                                    status: OperationStatus::RolledBack,
                                    error_code: 0,
                                });
                            }
                            rolled.push_back(OperationResult {
                                index: i,
                                status: OperationStatus::Failed,
                                error_code: code,
                            });

                            Self::rollback(env, &operations, i);

                            env.events()
                                .publish((symbol_short!("batch_fl"),), (i, code));

                            return Ok(BatchResult {
                                total,
                                succeeded: 0,
                                failed: 1,
                                rolled_back: true,
                                results: rolled,
                                estimated_gas,
                            });
                        }
                        RollbackStrategy::Partial => {
                            results.push_back(OperationResult {
                                index: i,
                                status: OperationStatus::Failed,
                                error_code: code,
                            });
                        }
                    }
                }
            }
        }

        env.events()
            .publish((symbol_short!("batch_ok"),), (succeeded, failed));

        Ok(BatchResult {
            total,
            succeeded,
            failed,
            rolled_back: false,
            results,
            estimated_gas,
        })
    }

    fn execute_single(env: &Env, op: &BatchOperation) -> Result<(), u32> {
        match op {
            BatchOperation::Report(r) => {
                let key = (symbol_short!("b_rpt"), r.agent_id.clone());
                let mut scores: Vec<u32> =
                    env.storage().temporary().get(&key).unwrap_or(Vec::new(env));
                scores.push_back(r.score);
                env.storage().temporary().set(&key, &scores);

                env.events().publish(
                    (symbol_short!("batch_rpt"), r.agent_id.clone()),
                    (r.reporter.clone(), r.score),
                );
                Ok(())
            }
            BatchOperation::Score(s) => {
                let key = (symbol_short!("b_scr"), s.account_id.clone());
                env.storage().temporary().set(&key, &s.score);

                env.events().publish(
                    (symbol_short!("batch_scr"), s.account_id.clone()),
                    s.score,
                );
                Ok(())
            }
            BatchOperation::Metadata(m) => {
                let key = (symbol_short!("b_meta"), m.agent.clone());
                env.storage()
                    .temporary()
                    .set(&key, &(m.json_cid.clone(), m.model_hash.clone()));

                env.events().publish(
                    (symbol_short!("batch_mta"), m.agent.clone()),
                    m.json_cid.len(),
                );
                Ok(())
            }
            BatchOperation::Risk(r) => {
                let key = (symbol_short!("b_risk"), r.agent.clone());
                env.storage().temporary().set(&key, &r.risk_level);

                env.events().publish(
                    (symbol_short!("batch_rsk"), r.agent.clone()),
                    r.risk_level,
                );
                Ok(())
            }
            BatchOperation::UpdateScore(s) => {
                let key = (symbol_short!("b_uscr"), s.account_id.clone());
                env.storage().temporary().set(&key, &s.score);

                env.events().publish(
                    (symbol_short!("b_uscr"), s.account_id.clone()),
                    s.score,
                );
                Ok(())
            }
            BatchOperation::FlagFraud(f) => {
                let key = (symbol_short!("b_fraud"), f.account_id.clone());
                env.storage().temporary().set(&key, &f.reason_code);

                env.events().publish(
                    (symbol_short!("b_fraud"), f.account_id.clone()),
                    f.reason_code,
                );
                Ok(())
            }
            BatchOperation::GrantRole(r) => {
                let key = (symbol_short!("b_role"), r.account_id.clone());
                env.storage().temporary().set(&key, &r.role);

                env.events().publish(
                    (symbol_short!("b_role"), r.account_id.clone()),
                    r.role,
                );
                Ok(())
            }
            BatchOperation::UpdateOracle(o) => {
                let key = (symbol_short!("b_orc"), o.feed_id.clone());
                env.storage()
                    .temporary()
                    .set(&key, &(o.price, o.timestamp));

                env.events().publish(
                    (symbol_short!("b_orc"), o.feed_id.clone()),
                    (o.price, o.timestamp),
                );
                Ok(())
            }
        }
    }

    /// Rollback operations up to (not including) `up_to` index.
    fn rollback(env: &Env, operations: &Vec<BatchOperation>, up_to: u32) {
        for i in 0..up_to {
            let op = operations.get(i).unwrap();
            Self::rollback_single(env, &op);
        }

        env.events()
            .publish((symbol_short!("batch_rb"),), up_to);
    }

    fn rollback_single(env: &Env, op: &BatchOperation) {
        match op {
            BatchOperation::Report(r) => {
                let key = (symbol_short!("b_rpt"), r.agent_id.clone());
                env.storage().temporary().remove(&key);
            }
            BatchOperation::Score(s) => {
                let key = (symbol_short!("b_scr"), s.account_id.clone());
                env.storage().temporary().remove(&key);
            }
            BatchOperation::Metadata(m) => {
                let key = (symbol_short!("b_meta"), m.agent.clone());
                env.storage().temporary().remove(&key);
            }
            BatchOperation::Risk(r) => {
                let key = (symbol_short!("b_risk"), r.agent.clone());
                env.storage().temporary().remove(&key);
            }
            BatchOperation::UpdateScore(s) => {
                let key = (symbol_short!("b_uscr"), s.account_id.clone());
                env.storage().temporary().remove(&key);
            }
            BatchOperation::FlagFraud(f) => {
                let key = (symbol_short!("b_fraud"), f.account_id.clone());
                env.storage().temporary().remove(&key);
            }
            BatchOperation::GrantRole(r) => {
                let key = (symbol_short!("b_role"), r.account_id.clone());
                env.storage().temporary().remove(&key);
            }
            BatchOperation::UpdateOracle(o) => {
                let key = (symbol_short!("b_orc"), o.feed_id.clone());
                env.storage().temporary().remove(&key);
            }
        }
    }
}

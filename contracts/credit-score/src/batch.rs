use soroban_sdk::{symbol_short, Address, Env, Vec};

use common_utils::batch::{
    BatchError, BatchExecutor, BatchOperation, BatchResult, BatchValidator, RollbackStrategy,
    ScoreUpdate,
};
use common_utils::storage_optimization::ScoreStorage;

/// Batch update credit scores atomically (all succeed or all roll back).
/// Requires admin authorization.
pub fn batch_update_scores(
    env: &Env,
    admin: &Address,
    updates: Vec<ScoreUpdate>,
) -> Result<BatchResult, BatchError> {
    admin.require_auth();

    let mut ops = Vec::new(env);
    for u in updates.iter() {
        ops.push_back(BatchOperation::UpdateScore(u));
    }

    // Pre-validate before touching storage
    BatchValidator::validate(&ops)?;

    let result = BatchExecutor::execute(env, ops, RollbackStrategy::AllOrNothing)?;

    // Commit to persistent storage only when all ops succeeded
    if !result.rolled_back {
        for update in updates.iter() {
            ScoreStorage::store_score(
                env,
                &update.account_id,
                update.score,
                env.ledger().timestamp(),
            )
            .map_err(|_| BatchError::OperationFailed)?;

            env.events().publish(
                (symbol_short!("scr_upd"), update.account_id.clone()),
                (update.score, env.ledger().timestamp()),
            );
        }
    }

    Ok(result)
}

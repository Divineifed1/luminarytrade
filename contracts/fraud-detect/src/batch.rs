use soroban_sdk::{symbol_short, Address, Env, Vec};

use common_utils::batch::{
    BatchError, BatchExecutor, BatchOperation, BatchResult, BatchValidator, FraudFlag,
    RollbackStrategy,
};

use crate::{DataKey, FraudReport};

/// Batch flag multiple accounts as fraudulent atomically.
/// Requires admin authorization.
pub fn batch_flag_fraud(
    env: &Env,
    admin: &Address,
    flags: Vec<FraudFlag>,
) -> Result<BatchResult, BatchError> {
    admin.require_auth();

    let mut ops = Vec::new(env);
    for f in flags.iter() {
        ops.push_back(BatchOperation::FlagFraud(f));
    }

    BatchValidator::validate(&ops)?;

    let result = BatchExecutor::execute(env, ops, RollbackStrategy::AllOrNothing)?;

    if !result.rolled_back {
        for flag in flags.iter() {
            let report = FraudReport {
                score: flag.reason_code.min(100),
                reporter: admin.clone(),
                timestamp: env.ledger().timestamp(),
            };

            // Use a per-account key derived from the address
            let key = DataKey::FlaggedAccount(flag.account_id.clone());
            env.storage().instance().set(&key, &report);

            env.events().publish(
                (symbol_short!("fraud_flg"), flag.account_id.clone()),
                (flag.reason_code, env.ledger().timestamp()),
            );
        }
    }

    Ok(result)
}

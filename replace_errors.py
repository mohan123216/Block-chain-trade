import re

with open('contracts/TradeSupplyChain.sol', 'r', encoding='utf-8') as f:
    code = f.read()

# Dictionary of replacements
replacements = {
    '"Unauthorized role"': 'UnauthorizedRole()',
    '"Role already assigned"': 'RoleAssigned()',
    '"Invalid role (1=Manufacturer,2=Retailer,3=Customer)"': 'InvalidRole()',
    '"Product ID already exists"': 'ProductExists()',
    '"Name cannot be empty"': 'EmptyName()',
    '"Quantity must be > 0"': 'InvalidQuantity()',
    '"Product not found"': 'ProductNotFound()',
    '"Product already sold"': 'ProductSold()',
    '"Not enough available quantity"': 'InsufficientQty()',
    '"Insufficient balance"': 'InsufficientBal()',
    '"Already requested"': 'AlreadyReq()',
    '"Not the manufacturer"': 'NotManufacturer()',
    '"Not enough quantity left"': 'InsufficientQty()',
    '"No pending request found for this retailer"': 'NoPendingReq()',
    '"No pending request found for this customer"': 'NoPendingReq()',
    '"Unauthorized"': 'Unauthorized()',
    '"No active request found to cancel"': 'NoActiveReq()',
    '"Incorrect payment amount"': 'IncorrectPayment()',
    '"No approved request found for your address"': 'NoApprovedReq()',
    '"Payment transfer failed"': 'PaymentFailed()',
    '"Generated ID already exists"': 'GeneratedIDExists()',
    '"You do not own this product"': 'NotOwner()',
    '"Product not owned by retailer"': 'NotRetailerOwned()'
}

errors_block = '''
    // ─── Errors ───────────────────────────────────────
    error UnauthorizedRole();
    error RoleAssigned();
    error InvalidRole();
    error ProductExists();
    error EmptyName();
    error InvalidQuantity();
    error ProductNotFound();
    error ProductSold();
    error InsufficientQty();
    error InsufficientBal();
    error AlreadyReq();
    error NotManufacturer();
    error NoPendingReq();
    error Unauthorized();
    error NoActiveReq();
    error IncorrectPayment();
    error NoApprovedReq();
    error PaymentFailed();
    error GeneratedIDExists();
    error NotOwner();
    error NotRetailerOwned();
    error Err();
'''

if "// ─── Errors" not in code:
    code = code.replace('    // ─── Structs ──────────────────────────────────────', errors_block + '\n    // ─── Structs ──────────────────────────────────────')

def replace_require(match):
    cond = match.group(1).strip()
    err_str = match.group(2).strip()
    custom_err = replacements.get(err_str, 'Err()')
    return f'if (!({cond})) revert {custom_err};'

# Regex to match require(..., "...");
# Note: we handle possible newlines inside the condition
code = re.sub(r'require\(\s*(.*?)\s*,\s*("[^"]+")\s*\);', replace_require, code, flags=re.DOTALL)

with open('contracts/TradeSupplyChain.sol', 'w', encoding='utf-8') as f:
    f.write(code)

print("Replaced!")

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title TradeSupplyChain
 * @notice Blockchain-based trade flow.
 *         Retailers request products → Manufacturer approves one → Retailer pays → Product transferred.
 */
contract TradeSupplyChain {

    // ─── Enums ────────────────────────────────────────
    enum Role          { None, Manufacturer, Retailer, Customer }
    enum RequestStatus { Pending, Approved, Rejected, Completed }


    // ─── Errors ───────────────────────────────────────
    error UnauthorizedRole();
    error RoleAlreadyAssigned();
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

    // ─── Structs ──────────────────────────────────────
    struct Product {
        uint256 id;
        string  name;
        address currentOwner;
        uint256 price;          // in wei
        address manufacturer;
        uint256 quantity;
        bool    exists;
    }

    struct ProductRequest {
        address       retailer;
        uint256       timestamp;
        RequestStatus status;
        uint256       quantity;
    }

    // ─── State ────────────────────────────────────────
    mapping(address  => Role)             public roles;
    mapping(uint256  => Product)          public products;
    mapping(uint256  => address[])        public productHistory;
    mapping(uint256  => ProductRequest[]) public productRequests;
    mapping(uint256  => ProductRequest[]) public customerRequests;

    uint256[]                             private allProductIds;
    mapping(address  => uint256[])        private manufacturerProducts;

    // ─── Events ───────────────────────────────────────
    event RoleAssigned      (address indexed account,     Role role);
    event ProductCreated    (uint256 indexed id, string name, address indexed manufacturer, uint256 price);
    event ProductRequested  (uint256 indexed productId, address indexed retailer);
    event RequestApproved   (uint256 indexed productId, address indexed retailer);
    event RequestRejected   (uint256 indexed productId, address indexed retailer);
    event ProductPurchased  (uint256 indexed productId, address indexed retailer, uint256 amount);
    event CustomerRequested (uint256 indexed productId, address indexed customer, address indexed retailer);
    event CustomerApproved  (uint256 indexed productId, address indexed customer, address indexed retailer);
    event CustomerRejected  (uint256 indexed productId, address indexed customer, address indexed retailer);
    event CustomerPurchased (uint256 indexed productId, address indexed customer, address indexed retailer, uint256 amount);
    event ProductTransferred(uint256 indexed id, address indexed from, address indexed to, uint256 price);

    // ─── Modifiers ────────────────────────────────────
    modifier onlyRole(Role r) {
        if (!(roles[msg.sender] == r)) revert UnauthorizedRole();
        _;
    }

    // ─── Role Management ──────────────────────────────
    function registerRole(uint8 role) external {
        if (!(roles[msg.sender] == Role.None)) revert RoleAlreadyAssigned();
        if (!(role >= 1 && role <= 3)) revert InvalidRole();
        roles[msg.sender] = Role(role);
        emit RoleAssigned(msg.sender, Role(role));
    }

    function getRole(address account) external view returns (uint8) {
        return uint8(roles[account]);
    }

    // ─── Product Management ───────────────────────────
    function createProduct(uint256 id, string calldata name, uint256 price, uint256 quantity)
        external onlyRole(Role.Manufacturer)
    {
        if (!(!products[id].exists)) revert ProductExists();
        if (!(bytes(name).length > 0)) revert EmptyName();
        if (!(quantity > 0)) revert InvalidQuantity();

        products[id] = Product({
            id:           id,
            name:         name,
            currentOwner: msg.sender,
            price:        price,
            manufacturer: msg.sender,
            quantity:     quantity,
            exists:       true
        });
        productHistory[id].push(msg.sender);
        allProductIds.push(id);
        manufacturerProducts[msg.sender].push(id);

        emit ProductCreated(id, name, msg.sender, price);
    }

    // ─── REQUEST FLOW ─────────────────────────────────

    /**
     * @notice Retailer requests to purchase a product.
     *         Product must still be owned by the manufacturer.
     */
    function requestProduct(uint256 productId, uint256 quantity) external onlyRole(Role.Retailer) {
        if (!(products[productId].exists)) revert ProductNotFound();
        if (!(products[productId].currentOwner == products[productId].manufacturer)) revert ProductSold();
        if (!(quantity > 0)) revert InvalidQuantity();
        if (!(products[productId].quantity >= quantity)) revert InsufficientQty();
        if (!(msg.sender.balance >= products[productId].price * quantity)) revert InsufficientBal();

        ProductRequest[] storage reqs = productRequests[productId];
        for (uint256 i = 0; i < reqs.length; i++) {
            // A retailer can only have one pending or approved request per product
            if (!(reqs[i].retailer != msg.sender || (reqs[i].status != RequestStatus.Pending && reqs[i].status != RequestStatus.Approved))) revert AlreadyReq();
        }

        reqs.push(ProductRequest({
            retailer:  msg.sender,
            timestamp: block.timestamp,
            status:    RequestStatus.Pending,
            quantity:  quantity
        }));

        emit ProductRequested(productId, msg.sender);
    }

    /**
     * @notice Manufacturer approves exactly ONE retailer request.
     *         All other Pending requests for this product are auto-Rejected.
     */
    function approveRequest(uint256 productId, address retailerAddr) external {
        if (!(products[productId].exists)) revert ProductNotFound();
        if (!(products[productId].manufacturer == msg.sender)) revert NotManufacturer();
        if (!(products[productId].currentOwner == msg.sender)) revert ProductSold();

        bool found = false;
        ProductRequest[] storage reqs = productRequests[productId];
        for (uint256 i = 0; i < reqs.length; i++) {
            if (reqs[i].retailer == retailerAddr && reqs[i].status == RequestStatus.Pending) {
                if (!(products[productId].quantity >= reqs[i].quantity)) revert InsufficientQty();
                products[productId].quantity -= reqs[i].quantity;
                reqs[i].status = RequestStatus.Approved;
                found = true;
                emit RequestApproved(productId, retailerAddr);
            }
            // Note: we no longer auto-reject other requests since there might be multiple units to fulfill others
        }
        if (!(found)) revert NoPendingReq();
    }

    /**
     * @notice Cancels a pending or approved request. If Approved, units are restored.
     */
    function cancelRequest(uint256 productId, address requester) external {
        if (!(products[productId].exists)) revert ProductNotFound();
        if (!(msg.sender == products[productId].manufacturer || msg.sender == requester)) revert Unauthorized();

        ProductRequest[] storage reqs = productRequests[productId];
        bool found = false;
        for (uint256 i = 0; i < reqs.length; i++) {
            if (reqs[i].retailer == requester && (reqs[i].status == RequestStatus.Pending || reqs[i].status == RequestStatus.Approved)) {
                if (reqs[i].status == RequestStatus.Approved) {
                    products[productId].quantity += reqs[i].quantity;
                }
                reqs[i].status = RequestStatus.Rejected;
                found = true;
                emit RequestRejected(productId, requester);
                break;
            }
        }
        if (!(found)) revert NoActiveReq();
    }

    /**
     * @notice Approved retailer pays the product price.
     *         ETH is forwarded to the manufacturer.
     *         Product ownership is transferred to the retailer.
     */
    function payForProduct(uint256 productId) external payable onlyRole(Role.Retailer) {
        if (!(products[productId].exists)) revert ProductNotFound();
        if (!(products[productId].currentOwner == products[productId].manufacturer)) revert ProductSold();

        // Find and mark approved request as Completed
        ProductRequest[] storage reqs = productRequests[productId];
        bool found = false;
        uint256 reqQty = 0;
        for (uint256 i = 0; i < reqs.length; i++) {
            if (reqs[i].retailer == msg.sender && reqs[i].status == RequestStatus.Approved) {
                reqQty = reqs[i].quantity;
                if (!(msg.value == products[productId].price * reqQty)) revert IncorrectPayment();
                reqs[i].status = RequestStatus.Completed;
                found = true;
                break;
            }
        }
        if (!(found)) revert NoApprovedReq();

        // Forward ETH to manufacturer
        address manufacturer = products[productId].manufacturer;
        (bool sent, ) = payable(manufacturer).call{value: msg.value}("");
        if (!(sent)) revert PaymentFailed();

        // Create new batch for retailer
        uint256 newId = uint256(keccak256(abi.encodePacked(productId, msg.sender, block.timestamp)));
        if (!(!products[newId].exists)) revert GeneratedIDExists();
        products[newId] = Product({
            id:           newId,
            name:         products[productId].name,
            currentOwner: msg.sender,
            price:        products[productId].price,
            manufacturer: manufacturer,
            quantity:     reqQty,
            exists:       true
        });
        productHistory[newId].push(manufacturer);
        productHistory[newId].push(msg.sender);
        allProductIds.push(newId);

        emit ProductTransferred(productId, manufacturer, msg.sender, msg.value);
        emit ProductPurchased(productId, msg.sender, msg.value);
    }

    // ─── Retailer → Customer Transfer ─────────────────
    /**
     * @notice Current owner transfers product to another address (Retailer→Customer).
     */
    function transferProduct(uint256 id, address to) external {
        if (!(products[id].exists)) revert ProductNotFound();
        if (!(products[id].currentOwner == msg.sender)) revert NotOwner();

        address from = msg.sender;
        products[id].currentOwner = to;
        productHistory[id].push(to);

        emit ProductTransferred(id, from, to, products[id].price);
    }

    // ─── CUSTOMER FLOW (Customer requests from Retailer) ─────────────────────

    /**
     * @notice Customer requests to purchase a product currently owned by a retailer.
     */
    function requestFromRetailer(uint256 productId, uint256 quantity) external onlyRole(Role.Customer) {
        if (!(products[productId].exists)) revert ProductNotFound();
        address retailer = products[productId].currentOwner;
        if (!(roles[retailer] == Role.Retailer)) revert NotRetailerOwned();
        if (!(quantity > 0)) revert InvalidQuantity();
        if (!(products[productId].quantity >= quantity)) revert InsufficientQty();
        if (!(msg.sender.balance >= products[productId].price * quantity)) revert InsufficientBal();

        ProductRequest[] storage reqs = customerRequests[productId];
        for (uint256 i = 0; i < reqs.length; i++) {
            if (!(reqs[i].retailer != msg.sender || (reqs[i].status != RequestStatus.Pending && reqs[i].status != RequestStatus.Approved))) revert AlreadyReq();
        }

        reqs.push(ProductRequest({
            retailer:  msg.sender,
            timestamp: block.timestamp,
            status:    RequestStatus.Pending,
            quantity:  quantity
        }));

        emit CustomerRequested(productId, msg.sender, retailer);
    }

    /**
     * @notice Retailer approves exactly ONE customer request for a product it owns.
     *         All other Pending requests for this product are auto-Rejected.
     */
    function approveCustomerRequest(uint256 productId, address customerAddr) external onlyRole(Role.Retailer) {
        if (!(products[productId].exists)) revert ProductNotFound();
        if (!(products[productId].currentOwner == msg.sender)) revert NotOwner();

        bool found = false;
        ProductRequest[] storage reqs = customerRequests[productId];
        for (uint256 i = 0; i < reqs.length; i++) {
            if (reqs[i].retailer == customerAddr && reqs[i].status == RequestStatus.Pending) {
                if (!(products[productId].quantity >= reqs[i].quantity)) revert InsufficientQty();
                products[productId].quantity -= reqs[i].quantity;
                reqs[i].status = RequestStatus.Approved;
                found = true;
                emit CustomerApproved(productId, customerAddr, msg.sender);
            }
        }
        if (!(found)) revert NoPendingReq();
    }

    /**
     * @notice Cancels a pending or approved customer request. If Approved, units are restored.
     */
    function cancelCustomerRequest(uint256 productId, address requester) external {
        if (!(products[productId].exists)) revert ProductNotFound();
        if (!(msg.sender == products[productId].currentOwner || msg.sender == requester)) revert Unauthorized();

        ProductRequest[] storage reqs = customerRequests[productId];
        bool found = false;
        for (uint256 i = 0; i < reqs.length; i++) {
            if (reqs[i].retailer == requester && (reqs[i].status == RequestStatus.Pending || reqs[i].status == RequestStatus.Approved)) {
                if (reqs[i].status == RequestStatus.Approved) {
                    products[productId].quantity += reqs[i].quantity;
                }
                reqs[i].status = RequestStatus.Rejected;
                found = true;
                emit CustomerRejected(productId, requester, products[productId].currentOwner);
                break;
            }
        }
        if (!(found)) revert NoActiveReq();
    }

    /**
     * @notice Approved customer pays the product price to the retailer and receives the product.
     */
    function payRetailerForProduct(uint256 productId) external payable onlyRole(Role.Customer) {
        if (!(products[productId].exists)) revert ProductNotFound();
        address retailer = products[productId].currentOwner;
        if (!(roles[retailer] == Role.Retailer)) revert NotRetailerOwned();

        // Find and mark approved request as Completed
        ProductRequest[] storage reqs = customerRequests[productId];
        bool found = false;
        uint256 reqQty = 0;
        for (uint256 i = 0; i < reqs.length; i++) {
            if (reqs[i].retailer == msg.sender && reqs[i].status == RequestStatus.Approved) {
                reqQty = reqs[i].quantity;
                if (!(msg.value == products[productId].price * reqQty)) revert IncorrectPayment();
                reqs[i].status = RequestStatus.Completed;
                found = true;
                break;
            }
        }
        if (!(found)) revert NoApprovedReq();

        // Forward ETH to retailer
        (bool sent, ) = payable(retailer).call{value: msg.value}("");
        if (!(sent)) revert PaymentFailed();

        // Mint new batch for customer
        uint256 newId = uint256(keccak256(abi.encodePacked(productId, msg.sender, block.timestamp)));
        if (!(!products[newId].exists)) revert GeneratedIDExists();
        products[newId] = Product({
            id:           newId,
            name:         products[productId].name,
            currentOwner: msg.sender,
            price:        products[productId].price,
            manufacturer: products[productId].manufacturer,
            quantity:     reqQty,
            exists:       true
        });
        
        // Copy original product history
        for (uint256 i = 0; i < productHistory[productId].length; i++) {
            productHistory[newId].push(productHistory[productId][i]);
        }
        productHistory[newId].push(msg.sender);
        allProductIds.push(newId);

        emit ProductTransferred(productId, retailer, msg.sender, msg.value);
        emit CustomerPurchased(productId, msg.sender, retailer, msg.value);
    }

    // ─── Views ────────────────────────────────────────
    function getProduct(uint256 id) external view returns (
        uint256 productId,
        string  memory name,
        address currentOwner,
        uint256 price,
        address manufacturer,
        uint256 quantity
    ) {
        if (!(products[id].exists)) revert ProductNotFound();
        Product storage p = products[id];
        return (p.id, p.name, p.currentOwner, p.price, p.manufacturer, p.quantity);
    }

    function getHistory(uint256 id) external view returns (address[] memory) {
        return productHistory[id];
    }

    function getManufacturerProducts(address manufacturer) external view returns (uint256[] memory) {
        return manufacturerProducts[manufacturer];
    }

    function getAllProductIds() external view returns (uint256[] memory) {
        return allProductIds;
    }

    function productExistsCheck(uint256 id) external view returns (bool) {
        return products[id].exists;
    }

    /**
     * @notice Returns all requests for a product — called by the manufacturer.
     *         Returns parallel arrays: retailers, timestamps, statuses (uint8).
     *         Sorted by timestamp ascending (blockchain insertion order).
     */
    function getProductRequests(uint256 productId)
        external view
        returns (
            address[] memory retailers,
            uint256[] memory timestamps,
            uint8[]   memory statuses,
            uint256[] memory quantities
        )
    {
        if (!(products[productId].exists)) revert ProductNotFound();
        ProductRequest[] storage reqs = productRequests[productId];
        uint256 len = reqs.length;
        retailers  = new address[](len);
        timestamps = new uint256[](len);
        statuses   = new uint8[](len);
        quantities = new uint256[](len);
        for (uint256 i = 0; i < len; i++) {
            retailers[i]  = reqs[i].retailer;
            timestamps[i] = reqs[i].timestamp;
            statuses[i]   = uint8(reqs[i].status);
            quantities[i] = reqs[i].quantity;
        }
    }

    /**
     * @notice Returns all customer requests for a product — called by the retailer.
     *         Returns parallel arrays: customers, timestamps, statuses (uint8).
     */
    function getCustomerRequests(uint256 productId)
        external view
        returns (
            address[] memory customers,
            uint256[] memory timestamps,
            uint8[]   memory statuses,
            uint256[] memory quantities
        )
    {
        if (!(products[productId].exists)) revert ProductNotFound();
        ProductRequest[] storage reqs = customerRequests[productId];
        uint256 len = reqs.length;
        customers  = new address[](len);
        timestamps = new uint256[](len);
        statuses   = new uint8[](len);
        quantities = new uint256[](len);
        for (uint256 i = 0; i < len; i++) {
            customers[i]  = reqs[i].retailer;
            timestamps[i] = reqs[i].timestamp;
            statuses[i]   = uint8(reqs[i].status);
            quantities[i] = reqs[i].quantity;
        }
    }

    /**
     * @notice Returns a retailer's request status for a specific product.
     *         Returns 255 if the retailer has NOT requested this product.
     *         0=Pending, 1=Approved, 2=Rejected, 3=Completed
     */
    function getRetailerRequestStatus(uint256 productId, address retailer)
        external view returns (uint8)
    {
        ProductRequest[] storage reqs = productRequests[productId];
        for (uint256 i = 0; i < reqs.length; i++) {
            if (reqs[i].retailer == retailer) {
                return uint8(reqs[i].status);
            }
        }
        return 255; // not requested
    }

    /**
     * @notice Returns a customer's request status for a specific product.
     *         Returns 255 if the customer has NOT requested this product.
     */
    function getCustomerRequestStatus(uint256 productId, address customer)
        external view returns (uint8)
    {
        ProductRequest[] storage reqs = customerRequests[productId];
        for (uint256 i = 0; i < reqs.length; i++) {
            if (reqs[i].retailer == customer) {
                return uint8(reqs[i].status);
            }
        }
        return 255; // not requested
    }

    /**
     * @notice Returns all product IDs that a retailer has requested, with their statuses.
     */
    function getRetailerRequests(address retailer)
        external view
        returns (uint256[] memory productIds, uint8[] memory statuses)
    {
        // Count first
        uint256 count = 0;
        for (uint256 j = 0; j < allProductIds.length; j++) {
            uint256 pid = allProductIds[j];
            ProductRequest[] storage reqs = productRequests[pid];
            for (uint256 i = 0; i < reqs.length; i++) {
                if (reqs[i].retailer == retailer) { count++; break; }
            }
        }
        productIds = new uint256[](count);
        statuses   = new uint8[](count);
        uint256 idx = 0;
        for (uint256 j = 0; j < allProductIds.length; j++) {
            uint256 pid = allProductIds[j];
            ProductRequest[] storage reqs = productRequests[pid];
            for (uint256 i = 0; i < reqs.length; i++) {
                if (reqs[i].retailer == retailer) {
                    productIds[idx] = pid;
                    statuses[idx]   = uint8(reqs[i].status);
                    idx++;
                    break;
                }
            }
        }
    }

    /**
     * @notice Update product price (manufacturer only, while still owner).
     */
    function updatePrice(uint256 id, uint256 newPrice) external {
        if (!(products[id].exists)) revert ProductNotFound();
        if (!(products[id].manufacturer == msg.sender)) revert NotManufacturer();
        if (!(products[id].currentOwner == msg.sender)) revert ProductSold();
        products[id].price = newPrice;
    }
}

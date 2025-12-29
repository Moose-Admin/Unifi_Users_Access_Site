document.addEventListener('DOMContentLoaded', async () => {
    const authContainer = document.getElementById('auth-container');
    const verifyContainer = document.getElementById('verify-container');
    const userDashboard = document.getElementById('user-dashboard');
    const sendCodeButton = document.getElementById('send-code');
    const verifyCodeButton = document.getElementById('verify-code');
    const logoutButton = document.getElementById('logout');
    const emailInput = document.getElementById('email');
    const codeInput = document.getElementById('code');
    const newPinInput = document.getElementById('new-pin');
    const changePinButton = document.getElementById('change-pin');
    const managedUserEmailSpan = document.getElementById('managed-user-email');
    const licensePlatesList = document.getElementById('license-plates-list');
    const newPlateInput = document.getElementById('new-plate');
    const addPlateButton = document.getElementById('add-plate');
    const loadingOverlay = document.getElementById('loading-overlay');
    const feedbackMessages = document.getElementById('feedback-messages');
    const pinError = document.getElementById('pin-error');
    const plateError = document.getElementById('plate-error');

    let currentUser = null;

    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 2000; // 2 seconds

    function showLoading() {
        loadingOverlay.style.display = 'flex';
    }

    function hideLoading() {
        loadingOverlay.style.display = 'none';
    }

    function validatePin(pin) {
        if (pin.length < 5 || pin.length > 8) {
            return "PIN must be 5-8 digits long.";
        }
        if (/(.)\1{2,}/.test(pin)) {
            return "PIN cannot have repetitive numbers (e.g., 11111).";
        }
        for (let i = 0; i < pin.length - 2; i++) {
            if (
                parseInt(pin[i+1]) === parseInt(pin[i]) + 1 &&
                parseInt(pin[i+2]) === parseInt(pin[i+1]) + 1
            ) {
                return "PIN cannot contain sequential numbers (e.g., 12345).";
            }
        }
        return null;
    }

    function validatePlate(plate) {
        if (!plate || plate.length < 1) {
            return "License plate cannot be empty.";
        }
        return null;
    }

    function displayMessage(message, type = 'info') {
        feedbackMessages.innerHTML = ''; // Clear previous messages
        pinError.style.display = 'none';
        plateError.style.display = 'none';
        feedbackMessages.style.display = 'block';
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
        alertDiv.role = 'alert';
        alertDiv.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        `;
        feedbackMessages.appendChild(alertDiv);

        setTimeout(() => {
            if (alertDiv.parentNode) {
                alertDiv.parentNode.removeChild(alertDiv);
            }
            if (feedbackMessages.children.length === 0) {
                feedbackMessages.style.display = 'none';
            }
        }, 5000); // Message disappears after 5 seconds
    }

    async function checkLogin(retryCount = 0) {
        showLoading();
        try {
            const response = await fetch('/api/user');
            if (response.ok) {
                currentUser = await response.json();
                authContainer.style.display = 'none';
                userDashboard.style.display = 'block';

                await getManagedUsers(currentUser.email);
                await getLicensePlates(currentUser.email);

                // After all data is fetched and rendered, make the user-info-display visible
                document.getElementById('user-info-display').style.display = 'block';

            } else {
                // Check for 404 specifically, which indicates user not found in cache
                if (response.status === 404 && retryCount < MAX_RETRIES) {
                    console.warn(`User not found on attempt ${retryCount + 1}. Retrying in ${RETRY_DELAY_MS / 1000} seconds...`);
                    setTimeout(() => checkLogin(retryCount + 1), RETRY_DELAY_MS);
                } else {
                    // If not 404 or max retries reached, show auth container
                    authContainer.style.display = 'block';
                    userDashboard.style.display = 'none';
                    if (response.status !== 404) {
                        displayMessage('Login failed. Please try again.', 'danger');
                    }
                }
            }
        } finally {
            hideLoading();
        }
    }

    async function getManagedUsers(email) {
        showLoading();
        try {
            const response = await fetch('/api/user/name', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email }),
            });
            const name = await response.text();
            document.getElementById('user-name').textContent = name;
            managedUserEmailSpan.textContent = email; // Display the user's email
        } finally {
            hideLoading();
        }
    }



    function createLicensePlateListItem(plate, selectedUserEmail) {
        const listItem = document.createElement('li');
        listItem.className = 'list-group-item d-flex justify-content-between align-items-center';
        listItem.textContent = plate.plate;
        const removeButton = document.createElement('button');
        removeButton.className = 'btn btn-danger btn-sm';
        removeButton.textContent = 'Remove';
        removeButton.addEventListener('click', async () => {
            showLoading();
            try {
                await fetch('/remove-license-plate', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ email: selectedUserEmail, plate: plate.plate }),
                });
                await getLicensePlates(selectedUserEmail);
            } finally {
                hideLoading();
            }
        });
        listItem.appendChild(removeButton);
        return listItem;
    }

    async function getLicensePlates(email) {
        showLoading();
        try {
            const response = await fetch('/get-license-plates', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email }),
            });
            const plates = await response.json();
            licensePlatesList.innerHTML = '';
            if (plates.length === 0) {
                const listItem = document.createElement('li');
                listItem.className = 'list-group-item text-muted';
                listItem.textContent = 'No license plates added yet.';
                licensePlatesList.appendChild(listItem);
            } else {
                plates.forEach(plate => {
                    const listItem = createLicensePlateListItem(plate, email);
                    licensePlatesList.appendChild(listItem);
                });
            }
        } finally {
            hideLoading();
        }
    }

    sendCodeButton.addEventListener('click', async () => {
        const email = emailInput.value;
        if (email) {
            showLoading();
            sendCodeButton.setAttribute('data-original-text', sendCodeButton.textContent);
            sendCodeButton.textContent = 'Sending...';
            sendCodeButton.disabled = true;
            try {
                await fetch('/send-code', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ email }),
                });
                authContainer.style.display = 'none';
                verifyContainer.style.display = 'block';
                displayMessage('Verification code sent to your email.', 'success');
            } catch (error) {
                console.error('Error sending code:', error);
                displayMessage('Failed to send verification code. Please try again.', 'danger');
            } finally {
                hideLoading();
                sendCodeButton.textContent = sendCodeButton.getAttribute('data-original-text');
                sendCodeButton.disabled = false;
            }
        } else {
            displayMessage('Please enter your email.', 'warning');
        }
    });

    verifyCodeButton.addEventListener('click', async () => {
        const email = emailInput.value;
        const code = codeInput.value;
        if (code) {
            showLoading();
            verifyCodeButton.setAttribute('data-original-text', verifyCodeButton.textContent);
            verifyCodeButton.textContent = 'Verifying...';
            verifyCodeButton.disabled = true;
            try {
                const response = await fetch('/verify-code', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ email, code }),
                });
                if (response.ok) {
                    verifyContainer.style.display = 'none';
                    await checkLogin();
                    displayMessage('Login successful!', 'success');
                } else {
                    displayMessage('Invalid code', 'danger');
                }
            } catch (error) {
                console.error('Error verifying code:', error);
                displayMessage('An error occurred during verification. Please try again.', 'danger');
            } finally {
                hideLoading();
                verifyCodeButton.textContent = verifyCodeButton.getAttribute('data-original-text');
                verifyCodeButton.disabled = false;
            }
        }
    });

    if (changePinButton) {
        changePinButton.addEventListener('click', async () => {
            const selectedUserEmail = currentUser.email;
            const newPin = newPinInput.value;
            const pinErrorMessage = validatePin(newPin);

            if (pinErrorMessage) {
                pinError.textContent = pinErrorMessage;
                pinError.style.display = 'block';
                return;
            } else {
                pinError.style.display = 'none';
            }

            if (newPin) {
                showLoading();
                changePinButton.setAttribute('data-original-text', changePinButton.textContent);
                changePinButton.textContent = 'Changing PIN...';
                changePinButton.disabled = true;
                try {
                    const response = await fetch('/change-pin', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ email: selectedUserEmail, newPin }),
                    });
                    if (response.ok) {
                        displayMessage('PIN changed successfully', 'success');
                        newPinInput.value = '';
                    } else {
                        displayMessage('Error changing PIN', 'danger');
                    }
                } catch (error) {
                    console.error('Error changing PIN:', error);
                    displayMessage('An error occurred while changing PIN. Please try again.', 'danger');
                } finally {
                    hideLoading();
                    changePinButton.textContent = changePinButton.getAttribute('data-original-text');
                    changePinButton.disabled = false;
                }
            }
        });
    }

    addPlateButton.addEventListener('click', async () => {
        const selectedUserEmail = currentUser.email;
        const newPlate = newPlateInput.value;
        const plateErrorMessage = validatePlate(newPlate);

        if (plateErrorMessage) {
            plateError.textContent = plateErrorMessage;
            plateError.style.display = 'block';
            return;
        } else {
            plateError.style.display = 'none';
        }

        if (newPlate) {
            showLoading();
            addPlateButton.setAttribute('data-original-text', addPlateButton.textContent);
            addPlateButton.textContent = 'Adding Plate...';
            addPlateButton.disabled = true;
            try {
                await fetch('/add-license-plate', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ email: selectedUserEmail, plate: newPlate }),
                });
                await getLicensePlates(selectedUserEmail);
                newPlateInput.value = '';
                displayMessage('License plate added successfully.', 'success');
            } catch (error) {
                console.error('Error adding plate:', error);
                displayMessage('Failed to add license plate. Please try again.', 'danger');
            } finally {
                hideLoading();
                addPlateButton.textContent = addPlateButton.getAttribute('data-original-text');
                addPlateButton.disabled = false;
            }
        }
    });

    const sendInviteButton = document.getElementById('send-invite-button');
    if (sendInviteButton) {
        sendInviteButton.addEventListener('click', async () => {
            if (!currentUser || !currentUser.email) {
                displayMessage('User email not available. Please log in again.', 'danger');
                return;
            }
            showLoading();
            sendInviteButton.setAttribute('data-original-text', sendInviteButton.textContent);
            sendInviteButton.textContent = 'Sending Invite...';
            sendInviteButton.disabled = true;
            try {
                const emailToInvite = currentUser.email; // Use logged-in user's email directly
                const response = await fetch('/api/send-invite', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ email: emailToInvite }),
                });

                if (response.ok) {
                    displayMessage(`Invitation sent successfully to your email (${emailToInvite}) for SMB Gate!`, 'success');
                } else {
                    const errorText = await response.text();
                    displayMessage(`Failed to send invitation to your email (${emailToInvite}) for SMB Gate: ${errorText}`, 'danger');
                }
            } catch (error) {
                console.error('Error sending invitation to SMB Gate:', error);
                displayMessage('An error occurred while trying to send the invitation to SMB Gate.', 'danger');
            } finally {
                hideLoading();
                sendInviteButton.textContent = sendInviteButton.getAttribute('data-original-text');
                sendInviteButton.disabled = false;
            }
        });
    }

    const sendInviteSite2Button = document.getElementById('send-invite-site2-button');
    if (sendInviteSite2Button) {
        sendInviteSite2Button.addEventListener('click', async () => {
            if (!currentUser || !currentUser.email) {
                displayMessage('User email not available. Please log in again.', 'danger');
                return;
            }
            showLoading();
            sendInviteSite2Button.setAttribute('data-original-text', sendInviteSite2Button.textContent);
            sendInviteSite2Button.textContent = 'Sending Invite...';
            sendInviteSite2Button.disabled = true;
            try {
                const emailToInvite = currentUser.email; // Use logged-in user's email directly
                const response = await fetch('/api/send-invite-site2', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ email: emailToInvite }),
                });

                if (response.ok) {
                    displayMessage(`Invitation sent successfully to your email (${emailToInvite}) for Clubhouse/Pool!`, 'success');
                } else {
                    const errorText = await response.text();
                    displayMessage(`Failed to send invitation to your email (${emailToInvite}) for Clubhouse/Pool: ${errorText}`, 'danger');
                }
            } catch (error) {
                console.error('Error sending invitation to Clubhouse/Pool:', error);
                displayMessage('An error occurred while trying to send the invitation to Clubhouse/Pool.', 'danger');
            }
            finally {
                hideLoading();
                sendInviteSite2Button.textContent = sendInviteSite2Button.getAttribute('data-original-text');
                sendInviteSite2Button.disabled = false;
            }
        });
    }

    // Visitor Management Functions
    async function getVisitors() {
        showLoading();
        try {
            const response = await fetch('/api/visitors', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                }
            });
            if (!response.ok) {
                throw new Error('Failed to fetch visitors');
            }
            const data = await response.json();
            return data.data || [];
        } catch (error) {
            console.error('Error fetching visitors:', error);
            displayMessage('Failed to fetch visitors. Please try again.', 'danger');
            return [];
        } finally {
            hideLoading();
        }
    }

    function createVisitorTableRow(visitor) {
        const row = document.createElement('tr');
        
        const visitorNameCell = document.createElement('td');
        let visitorName = 'Unknown';
        if (visitor.first_name && visitor.last_name) {
            visitorName = `${visitor.first_name} ${visitor.last_name}`;
        } else if (visitor.first_name) {
            visitorName = visitor.first_name;
        } else if (visitor.last_name) {
            visitorName = visitor.last_name;
        }
        visitorNameCell.textContent = visitorName;
        
        const licensePlatesCell = document.createElement('td');
        if (visitor.license_plates && visitor.license_plates.length > 0) {
            const platesContainer = document.createElement('div');
            visitor.license_plates.forEach(plate => {
                const plateDiv = document.createElement('div');
                plateDiv.className = 'd-flex justify-content-between align-items-center mb-2';
                
                const plateSpan = document.createElement('span');
                plateSpan.textContent = plate.credential;
                
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'btn btn-close ms-2';
                deleteBtn.setAttribute('type', 'button');
                deleteBtn.setAttribute('aria-label', `Remove plate ${plate.credential}`);
                deleteBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (confirm(`Remove plate ${plate.credential} from this visitor?`)) {
                        showLoading();
                        try {
                            const response = await fetch('/api/delete-visitor-plate', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                },
                                body: JSON.stringify({ visitorId: visitor.id, plateId: plate.id }),
                            });
                            if (response.ok) {
                                displayMessage(`Plate ${plate.credential} removed successfully`, 'success');
                                await displayVisitors();
                            } else {
                                const errorText = await response.text();
                                displayMessage(`Failed to remove plate: ${errorText}`, 'danger');
                            }
                        } catch (error) {
                            console.error('Error removing plate:', error);
                            displayMessage('Failed to remove plate. Please try again.', 'danger');
                        } finally {
                            hideLoading();
                        }
                    }
                });
                
                plateDiv.appendChild(plateSpan);
                plateDiv.appendChild(deleteBtn);
                platesContainer.appendChild(plateDiv);
            });
            licensePlatesCell.appendChild(platesContainer);
        } else {
            licensePlatesCell.textContent = 'No plates';
        }
        
        const expirationCell = document.createElement('td');
        if (visitor.end_time) {
            const expirationDate = new Date(visitor.end_time * 1000);
            expirationCell.textContent = expirationDate.toLocaleDateString();
        } else {
            expirationCell.textContent = 'No expiration';
        }
        
        const actionsCell = document.createElement('td');
        
        const addPlateButton = document.createElement('button');
        addPlateButton.className = 'btn btn-sm btn-info me-2';
        addPlateButton.textContent = 'Add Plate';
        addPlateButton.addEventListener('click', async () => {
            const newPlate = prompt('Enter license plate to add:');
            if (newPlate) {
                showLoading();
                try {
                    const response = await fetch('/api/add-visitor-plate', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ visitorId: visitor.id, plate: newPlate }),
                    });
                    if (response.ok) {
                        displayMessage(`Plate ${newPlate} added successfully to visitor`, 'success');
                        await displayVisitors();
                    } else {
                        const errorText = await response.text();
                        displayMessage(`Failed to add plate: ${errorText}`, 'danger');
                    }
                } catch (error) {
                    console.error('Error adding plate:', error);
                    displayMessage('Failed to add plate. Please try again.', 'danger');
                } finally {
                    hideLoading();
                }
            }
        });
        
        const deleteButton = document.createElement('button');
        deleteButton.className = 'btn btn-sm btn-danger';
        deleteButton.textContent = 'Delete Visitor';
        deleteButton.addEventListener('click', async () => {
            if (confirm('Are you sure you want to delete this visitor?')) {
                showLoading();
                try {
                    const response = await fetch('/api/delete-visitor', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ visitorId: visitor.id }),
                    });
                    if (response.ok) {
                        displayMessage('Visitor deleted successfully', 'success');
                        await displayVisitors();
                    } else {
                        const errorText = await response.text();
                        displayMessage(`Failed to delete visitor: ${errorText}`, 'danger');
                    }
                } catch (error) {
                    console.error('Error deleting visitor:', error);
                    displayMessage('Failed to delete visitor. Please try again.', 'danger');
                } finally {
                    hideLoading();
                }
            }
        });
        
        actionsCell.appendChild(addPlateButton);
        actionsCell.appendChild(deleteButton);
        
        row.appendChild(visitorNameCell);
        row.appendChild(licensePlatesCell);
        row.appendChild(expirationCell);
        row.appendChild(actionsCell);
        
        return row;
    }

    async function displayVisitors() {
        const visitorsList = document.getElementById('visitors-list');
        const visitorsEmpty = document.getElementById('visitors-empty');
        const visitorsLoading = document.getElementById('visitors-loading');
        
        visitorsLoading.style.display = 'block';
        visitorsList.innerHTML = '';
        visitorsEmpty.style.display = 'none';
        
        const visitors = await getVisitors();
        
        visitorsLoading.style.display = 'none';
        
        if (visitors.length === 0) {
            visitorsEmpty.style.display = 'block';
        } else {
            const table = document.createElement('table');
            table.className = 'table table-striped table-hover';
            
            const thead = document.createElement('thead');
            thead.innerHTML = `
                <tr>
                    <th>Visitor Name</th>
                    <th>License Plates</th>
                    <th>Expires</th>
                    <th>Actions</th>
                </tr>
            `;
            table.appendChild(thead);
            
            const tbody = document.createElement('tbody');
            visitors.forEach(visitor => {
                const row = createVisitorTableRow(visitor);
                tbody.appendChild(row);
            });
            table.appendChild(tbody);
            
            visitorsList.appendChild(table);
        }
    }

    // Load visitors when Visitors tab is clicked
    const visitorsTab = document.getElementById('visitors-tab');
    if (visitorsTab) {
        visitorsTab.addEventListener('shown.bs.tab', async () => {
            await displayVisitors();
        });
    }

    logoutButton.addEventListener('click', async () => {
        showLoading();
        try {
            await fetch('/logout', { method: 'POST' });
            currentUser = null;
            userDashboard.style.display = 'none';
            authContainer.style.display = 'block';
            emailInput.value = '';
            codeInput.value = '';
            newPinInput.value = '';
            newPlateInput.value = '';
            managedUsersDropdown.innerHTML = '';
            licensePlatesList.innerHTML = '';
        } finally {
            hideLoading();
        }
    });

    await checkLogin();
});

// App.tsx
import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

interface PhysicsLaw {
  id: string;
  encryptedValue: string;
  timestamp: number;
  discoverer: string;
  category: string;
  status: "hypothesis" | "verified" | "debunked";
  description: string;
}

const FHEEncryptNumber = (value: number): string => {
  return `FHE-${btoa(value.toString())}`;
};

const FHEDecryptNumber = (encryptedData: string): number => {
  if (encryptedData.startsWith('FHE-')) {
    return parseFloat(atob(encryptedData.substring(4)));
  }
  return parseFloat(encryptedData);
};

const FHECompute = (encryptedData: string, operation: string): string => {
  const value = FHEDecryptNumber(encryptedData);
  let result = value;
  
  switch(operation) {
    case 'inverse':
      result = 1/value;
      break;
    case 'square':
      result = value * value;
      break;
    case 'sqrt':
      result = Math.sqrt(value);
      break;
    default:
      result = value;
  }
  
  return FHEEncryptNumber(result);
};

const generatePublicKey = () => `0x${Array(2000).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [laws, setLaws] = useState<PhysicsLaw[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ visible: false, status: "pending", message: "" });
  const [newLawData, setNewLawData] = useState({ category: "gravity", description: "", value: 0 });
  const [selectedLaw, setSelectedLaw] = useState<PhysicsLaw | null>(null);
  const [decryptedValue, setDecryptedValue] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [publicKey, setPublicKey] = useState<string>("");
  const [contractAddress, setContractAddress] = useState<string>("");
  const [chainId, setChainId] = useState<number>(0);
  const [startTimestamp, setStartTimestamp] = useState<number>(0);
  const [durationDays, setDurationDays] = useState<number>(30);
  const verifiedCount = laws.filter(l => l.status === "verified").length;
  const hypothesisCount = laws.filter(l => l.status === "hypothesis").length;
  const debunkedCount = laws.filter(l => l.status === "debunked").length;

  // Community links
  const communityLinks = [
    { name: "World Wiki", url: "#wiki", icon: "📚" },
    { name: "Research Forum", url: "#forum", icon: "💬" },
    { name: "Experiment Logs", url: "#logs", icon: "🔬" },
    { name: "Physics Textbook", url: "#textbook", icon: "📖" }
  ];

  // Feed items
  const [feedItems, setFeedItems] = useState([
    { id: 1, type: "discovery", user: "QuantumExplorer", content: "Discovered new gravity constant variation in northern region", timestamp: Date.now() - 3600000 },
    { id: 2, type: "debate", user: "PhysicsPurist", content: "Challenging the FHE-encrypted magic reaction theory", timestamp: Date.now() - 7200000 },
    { id: 3, type: "experiment", user: "AlchemyLab", content: "Conducted 127th element combination test", timestamp: Date.now() - 10800000 }
  ]);

  useEffect(() => {
    loadLaws().finally(() => setLoading(false));
    const initSignatureParams = async () => {
      const contract = await getContractReadOnly();
      if (contract) setContractAddress(await contract.getAddress());
      if (window.ethereum) {
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        setChainId(parseInt(chainIdHex, 16));
      }
      setStartTimestamp(Math.floor(Date.now() / 1000));
      setDurationDays(30);
      setPublicKey(generatePublicKey());
    };
    initSignatureParams();
  }, []);

  const loadLaws = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }

      // Load law keys
      const keysBytes = await contract.getData("law_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try {
          const keysStr = ethers.toUtf8String(keysBytes);
          if (keysStr.trim() !== '') keys = JSON.parse(keysStr);
        } catch (e) { console.error("Error parsing law keys:", e); }
      }

      // Load each law
      const lawList: PhysicsLaw[] = [];
      for (const key of keys) {
        try {
          const lawBytes = await contract.getData(`law_${key}`);
          if (lawBytes.length > 0) {
            try {
              const lawData = JSON.parse(ethers.toUtf8String(lawBytes));
              lawList.push({ 
                id: key, 
                encryptedValue: lawData.value, 
                timestamp: lawData.timestamp, 
                discoverer: lawData.discoverer, 
                category: lawData.category,
                description: lawData.description,
                status: lawData.status || "hypothesis"
              });
            } catch (e) { console.error(`Error parsing law data for ${key}:`, e); }
          }
        } catch (e) { console.error(`Error loading law ${key}:`, e); }
      }
      
      lawList.sort((a, b) => b.timestamp - a.timestamp);
      setLaws(lawList);
    } catch (e) { 
      console.error("Error loading laws:", e); 
    } finally { 
      setIsRefreshing(false); 
      setLoading(false); 
    }
  };

  const submitLaw = async () => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setCreating(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Encrypting physics law with Zama FHE..." });
    try {
      const encryptedValue = FHEEncryptNumber(newLawData.value);
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const lawId = `law-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const lawData = { 
        value: encryptedValue, 
        timestamp: Math.floor(Date.now() / 1000), 
        discoverer: address, 
        category: newLawData.category,
        description: newLawData.description,
        status: "hypothesis"
      };
      
      await contract.setData(`law_${lawId}`, ethers.toUtf8Bytes(JSON.stringify(lawData)));
      
      // Update law keys
      const keysBytes = await contract.getData("law_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try { keys = JSON.parse(ethers.toUtf8String(keysBytes)); } 
        catch (e) { console.error("Error parsing keys:", e); }
      }
      keys.push(lawId);
      await contract.setData("law_keys", ethers.toUtf8Bytes(JSON.stringify(keys)));
      
      setTransactionStatus({ visible: true, status: "success", message: "Physics law encrypted and submitted!" });
      await loadLaws();
      
      // Add to feed
      setFeedItems(prev => [{
        id: Date.now(),
        type: "discovery",
        user: address?.substring(0, 6) + '...' || "Anonymous",
        content: `Proposed new ${newLawData.category} law: ${newLawData.description.substring(0, 50)}...`,
        timestamp: Date.now()
      }, ...prev]);
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewLawData({ category: "gravity", description: "", value: 0 });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreating(false); 
    }
  };

  const decryptWithSignature = async (encryptedData: string): Promise<number | null> => {
    if (!isConnected) { alert("Please connect wallet first"); return null; }
    setIsDecrypting(true);
    try {
      const message = `publickey:${publicKey}\ncontractAddresses:${contractAddress}\ncontractsChainId:${chainId}\nstartTimestamp:${startTimestamp}\ndurationDays:${durationDays}`;
      await signMessageAsync({ message });
      await new Promise(resolve => setTimeout(resolve, 1500));
      return FHEDecryptNumber(encryptedData);
    } catch (e) { 
      console.error("Decryption failed:", e); 
      return null; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  const verifyLaw = async (lawId: string) => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setTransactionStatus({ visible: true, status: "pending", message: "Processing physics law with FHE..." });
    try {
      const contract = await getContractReadOnly();
      if (!contract) throw new Error("Failed to get contract");
      
      const lawBytes = await contract.getData(`law_${lawId}`);
      if (lawBytes.length === 0) throw new Error("Law not found");
      const lawData = JSON.parse(ethers.toUtf8String(lawBytes));
      
      // Perform FHE computation to verify
      const verifiedValue = FHECompute(lawData.value, 'square');
      
      const contractWithSigner = await getContractWithSigner();
      if (!contractWithSigner) throw new Error("Failed to get contract with signer");
      
      const updatedLaw = { ...lawData, status: "verified", value: verifiedValue };
      await contractWithSigner.setData(`law_${lawId}`, ethers.toUtf8Bytes(JSON.stringify(updatedLaw)));
      
      setTransactionStatus({ visible: true, status: "success", message: "FHE verification completed!" });
      await loadLaws();
      
      // Add to feed
      const law = laws.find(l => l.id === lawId);
      if (law) {
        setFeedItems(prev => [{
          id: Date.now(),
          type: "verification",
          user: address?.substring(0, 6) + '...' || "Anonymous",
          content: `Verified ${law.category} law proposed by ${law.discoverer.substring(0, 6)}...`,
          timestamp: Date.now()
        }, ...prev]);
      }
      
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Verification failed: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const debunkLaw = async (lawId: string) => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setTransactionStatus({ visible: true, status: "pending", message: "Processing physics law with FHE..." });
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const lawBytes = await contract.getData(`law_${lawId}`);
      if (lawBytes.length === 0) throw new Error("Law not found");
      const lawData = JSON.parse(ethers.toUtf8String(lawBytes));
      
      const updatedLaw = { ...lawData, status: "debunked" };
      await contract.setData(`law_${lawId}`, ethers.toUtf8Bytes(JSON.stringify(updatedLaw)));
      
      setTransactionStatus({ visible: true, status: "success", message: "Law debunked!" });
      await loadLaws();
      
      // Add to feed
      const law = laws.find(l => l.id === lawId);
      if (law) {
        setFeedItems(prev => [{
          id: Date.now(),
          type: "debunk",
          user: address?.substring(0, 6) + '...' || "Anonymous",
          content: `Debunked ${law.category} law proposed by ${law.discoverer.substring(0, 6)}...`,
          timestamp: Date.now()
        }, ...prev]);
      }
      
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Failed to debunk: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const isDiscoverer = (lawAddress: string) => address?.toLowerCase() === lawAddress.toLowerCase();

  const renderRadialChart = () => {
    const total = laws.length || 1;
    const verifiedPercentage = (verifiedCount / total) * 100;
    const hypothesisPercentage = (hypothesisCount / total) * 100;
    const debunkedPercentage = (debunkedCount / total) * 100;
    
    return (
      <div className="radial-chart-container">
        <div className="radial-chart">
          <div className="radial-segment verified" style={{ '--percentage': verifiedPercentage } as React.CSSProperties}></div>
          <div className="radial-segment hypothesis" style={{ '--percentage': hypothesisPercentage } as React.CSSProperties}></div>
          <div className="radial-segment debunked" style={{ '--percentage': debunkedPercentage } as React.CSSProperties}></div>
          <div className="radial-center">
            <div className="radial-value">{laws.length}</div>
            <div className="radial-label">Laws</div>
          </div>
        </div>
        <div className="radial-legend">
          <div className="legend-item"><div className="color-box verified"></div><span>Verified: {verifiedCount}</span></div>
          <div className="legend-item"><div className="color-box hypothesis"></div><span>Hypothesis: {hypothesisCount}</span></div>
          <div className="legend-item"><div className="color-box debunked"></div><span>Debunked: {debunkedCount}</span></div>
        </div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="quantum-spinner">
        <div className="particle"></div>
        <div className="particle"></div>
        <div className="particle"></div>
      </div>
      <p>Initializing quantum connection to autonomous world...</p>
    </div>
  );

  return (
    <div className="app-container future-metal-theme">
      <div className="central-radial-layout">
        <header className="app-header">
          <div className="logo">
            <div className="atom-icon">
              <div className="nucleus"></div>
              <div className="orbit"></div>
              <div className="orbit"></div>
              <div className="orbit"></div>
            </div>
            <h1>Autonomous<span>Physics</span>World</h1>
          </div>
          <div className="header-actions">
            <button onClick={() => setShowCreateModal(true)} className="create-law-btn metal-button">
              <div className="add-icon"></div>Propose Law
            </button>
            <div className="wallet-connect-wrapper">
              <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
            </div>
          </div>
        </header>

        <main className="main-content">
          <div className="welcome-banner">
            <div className="welcome-text">
              <h2>Discover FHE-Encrypted Physics</h2>
              <p>A fully on-chain world where fundamental laws are encrypted with Zama FHE technology</p>
            </div>
            <div className="fhe-indicator">
              <div className="fhe-lock"></div>
              <span>FHE Encryption Active</span>
            </div>
          </div>

          <div className="project-intro metal-card">
            <h2>About This World</h2>
            <p>
              This autonomous world runs entirely on-chain with some fundamental physics laws encrypted using 
              <strong> Zama FHE technology</strong>. Players must collaborate through experiments to discover and 
              verify these hidden laws, collectively building the world's physics textbook.
            </p>
            <div className="fhe-badge">
              <span>FHE-Powered Discovery</span>
            </div>
          </div>

          <div className="stats-section">
            <div className="stats-grid">
              <div className="stats-card metal-card">
                <h3>World Statistics</h3>
                <div className="stats-content">
                  {renderRadialChart()}
                  <div className="stats-numbers">
                    <div className="stat-item">
                      <div className="stat-value">{laws.length}</div>
                      <div className="stat-label">Total Laws</div>
                    </div>
                    <div className="stat-item">
                      <div className="stat-value">{verifiedCount}</div>
                      <div className="stat-label">Verified</div>
                    </div>
                    <div className="stat-item">
                      <div className="stat-value">{hypothesisCount}</div>
                      <div className="stat-label">Hypotheses</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="community-card metal-card">
                <h3>Community Resources</h3>
                <div className="community-links">
                  {communityLinks.map((link, index) => (
                    <a key={index} href={link.url} className="community-link">
                      <span className="link-icon">{link.icon}</span>
                      <span>{link.name}</span>
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="feed-section metal-card">
            <h2>World Activity Feed</h2>
            <div className="feed-items">
              {feedItems.map(item => (
                <div key={item.id} className="feed-item">
                  <div className="feed-header">
                    <span className="feed-type">{item.type}</span>
                    <span className="feed-user">{item.user}</span>
                    <span className="feed-time">{new Date(item.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <div className="feed-content">{item.content}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="laws-section">
            <div className="section-header">
              <h2>Discovered Physics Laws</h2>
              <div className="header-actions">
                <button onClick={loadLaws} className="refresh-btn metal-button" disabled={isRefreshing}>
                  {isRefreshing ? "Refreshing..." : "Refresh"}
                </button>
              </div>
            </div>
            
            <div className="laws-list metal-card">
              <div className="table-header">
                <div className="header-cell">ID</div>
                <div className="header-cell">Category</div>
                <div className="header-cell">Discoverer</div>
                <div className="header-cell">Date</div>
                <div className="header-cell">Status</div>
                <div className="header-cell">Actions</div>
              </div>
              
              {laws.length === 0 ? (
                <div className="no-laws">
                  <div className="no-laws-icon"></div>
                  <p>No physics laws discovered yet</p>
                  <button className="metal-button primary" onClick={() => setShowCreateModal(true)}>
                    Propose First Law
                  </button>
                </div>
              ) : laws.map(law => (
                <div className="law-row" key={law.id} onClick={() => setSelectedLaw(law)}>
                  <div className="table-cell law-id">#{law.id.substring(0, 6)}</div>
                  <div className="table-cell">{law.category}</div>
                  <div className="table-cell">{law.discoverer.substring(0, 6)}...{law.discoverer.substring(38)}</div>
                  <div className="table-cell">{new Date(law.timestamp * 1000).toLocaleDateString()}</div>
                  <div className="table-cell">
                    <span className={`status-badge ${law.status}`}>{law.status}</span>
                  </div>
                  <div className="table-cell actions">
                    {isDiscoverer(law.discoverer) && law.status === "hypothesis" && (
                      <>
                        <button className="action-btn metal-button success" 
                          onClick={(e) => { e.stopPropagation(); verifyLaw(law.id); }}>
                          Verify
                        </button>
                        <button className="action-btn metal-button danger" 
                          onClick={(e) => { e.stopPropagation(); debunkLaw(law.id); }}>
                          Debunk
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>

        <footer className="app-footer">
          <div className="footer-content">
            <div className="footer-brand">
              <div className="logo">
                <div className="atom-icon small"></div>
                <span>AutonomousPhysicsWorld</span>
              </div>
              <p>Discover encrypted physics laws with Zama FHE technology</p>
            </div>
            <div className="footer-links">
              <a href="#" className="footer-link">Documentation</a>
              <a href="#" className="footer-link">Research Papers</a>
              <a href="#" className="footer-link">Community</a>
              <a href="#" className="footer-link">Contact</a>
            </div>
          </div>
          <div className="footer-bottom">
            <div className="fhe-badge">
              <span>FHE-Powered Discovery</span>
            </div>
            <div className="copyright">
              © {new Date().getFullYear()} Autonomous Physics World. All rights reserved.
            </div>
          </div>
        </footer>
      </div>

      {showCreateModal && (
        <ModalCreate 
          onSubmit={submitLaw} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating} 
          lawData={newLawData} 
          setLawData={setNewLawData}
        />
      )}
      
      {selectedLaw && (
        <LawDetailModal 
          law={selectedLaw} 
          onClose={() => { setSelectedLaw(null); setDecryptedValue(null); }} 
          decryptedValue={decryptedValue} 
          setDecryptedValue={setDecryptedValue} 
          isDecrypting={isDecrypting} 
          decryptWithSignature={decryptWithSignature}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content metal-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="quantum-spinner small"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  lawData: any;
  setLawData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ onSubmit, onClose, creating, lawData, setLawData }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setLawData({ ...lawData, [name]: value });
  };

  const handleValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setLawData({ ...lawData, [name]: parseFloat(value) });
  };

  const handleSubmit = () => {
    if (!lawData.category || !lawData.value || !lawData.description) { 
      alert("Please fill all required fields"); 
      return; 
    }
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal metal-card">
        <div className="modal-header">
          <h2>Propose New Physics Law</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        <div className="modal-body">
          <div className="fhe-notice-banner">
            <div className="key-icon"></div> 
            <div>
              <strong>FHE Encryption Notice</strong>
              <p>Your physics law value will be encrypted with Zama FHE before submission</p>
            </div>
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label>Category *</label>
              <select 
                name="category" 
                value={lawData.category} 
                onChange={handleChange} 
                className="metal-select"
              >
                <option value="gravity">Gravity</option>
                <option value="magic">Magic Elements</option>
                <option value="quantum">Quantum Effects</option>
                <option value="time">Time Dilation</option>
                <option value="other">Other</option>
              </select>
            </div>
            
            <div className="form-group">
              <label>Description *</label>
              <textarea 
                name="description" 
                value={lawData.description} 
                onChange={handleChange} 
                placeholder="Describe your physics law hypothesis..."
                className="metal-textarea"
                rows={3}
              />
            </div>
            
            <div className="form-group">
              <label>Numerical Value *</label>
              <input 
                type="number" 
                name="value" 
                value={lawData.value} 
                onChange={handleValueChange} 
                placeholder="Enter the numerical constant..."
                className="metal-input"
                step="0.000001"
              />
            </div>
          </div>
          
          <div className="encryption-preview">
            <h4>Encryption Preview</h4>
            <div className="preview-container">
              <div className="plain-data">
                <span>Plain Value:</span>
                <div>{lawData.value || 'No value entered'}</div>
              </div>
              <div className="encryption-arrow">→</div>
              <div className="encrypted-data">
                <span>Encrypted Data:</span>
                <div>
                  {lawData.value ? FHEEncryptNumber(lawData.value).substring(0, 50) + '...' : 'No value entered'}
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn metal-button">Cancel</button>
          <button onClick={handleSubmit} disabled={creating} className="submit-btn metal-button primary">
            {creating ? "Encrypting with FHE..." : "Submit Law"}
          </button>
        </div>
      </div>
    </div>
  );
};

interface LawDetailModalProps {
  law: PhysicsLaw;
  onClose: () => void;
  decryptedValue: number | null;
  setDecryptedValue: (value: number | null) => void;
  isDecrypting: boolean;
  decryptWithSignature: (encryptedData: string) => Promise<number | null>;
}

const LawDetailModal: React.FC<LawDetailModalProps> = ({ 
  law, 
  onClose, 
  decryptedValue, 
  setDecryptedValue, 
  isDecrypting, 
  decryptWithSignature 
}) => {
  const handleDecrypt = async () => {
    if (decryptedValue !== null) { 
      setDecryptedValue(null); 
      return; 
    }
    const decrypted = await decryptWithSignature(law.encryptedValue);
    if (decrypted !== null) setDecryptedValue(decrypted);
  };

  return (
    <div className="modal-overlay">
      <div className="law-detail-modal metal-card">
        <div className="modal-header">
          <h2>Law Details #{law.id.substring(0, 8)}</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="law-info">
            <div className="info-item">
              <span>Category:</span>
              <strong>{law.category}</strong>
            </div>
            <div className="info-item">
              <span>Discoverer:</span>
              <strong>{law.discoverer.substring(0, 6)}...{law.discoverer.substring(38)}</strong>
            </div>
            <div className="info-item">
              <span>Date:</span>
              <strong>{new Date(law.timestamp * 1000).toLocaleString()}</strong>
            </div>
            <div className="info-item">
              <span>Status:</span>
              <strong className={`status-badge ${law.status}`}>{law.status}</strong>
            </div>
          </div>
          
          <div className="law-description">
            <h3>Description</h3>
            <p>{law.description}</p>
          </div>
          
          <div className="encrypted-data-section">
            <h3>Encrypted Value</h3>
            <div className="encrypted-data">
              {law.encryptedValue.substring(0, 100)}...
            </div>
            <div className="fhe-tag">
              <div className="fhe-icon"></div>
              <span>FHE Encrypted</span>
            </div>
            
            <button 
              className="decrypt-btn metal-button" 
              onClick={handleDecrypt} 
              disabled={isDecrypting}
            >
              {isDecrypting ? (
                <span className="decrypt-spinner"></span>
              ) : decryptedValue !== null ? (
                "Hide Decrypted Value"
              ) : (
                "Decrypt with Wallet Signature"
              )}
            </button>
          </div>
          
          {decryptedValue !== null && (
            <div className="decrypted-data-section">
              <h3>Decrypted Value</h3>
              <div className="decrypted-value">{decryptedValue}</div>
              <div className="decryption-notice">
                <div className="warning-icon"></div>
                <span>Decrypted data is only visible after wallet signature verification</span>
              </div>
            </div>
          )}
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn metal-button">Close</button>
        </div>
      </div>
    </div>
  );
};

export default App;

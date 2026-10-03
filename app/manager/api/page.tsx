"use client";

import { useState, useEffect, useMemo } from "react";
import { 
  Key, 
  Plus, 
  Copy, 
  Trash2, 
  RefreshCw, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  Clock,
  Activity,
  Shield,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Search,
  Filter,
  MoreHorizontal,
  Info,
  TrendingUp,
  Calendar,
  Zap
} from "lucide-react";
import Button from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import type { SelectOption } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  role: string;
  client?: { id: string; name: string } | null;
  mission?: { id: string; name: string } | null;
  allowedEndpoints: string[];
  rateLimitPerMinute: number;
  rateLimitPerHour: number;
  isActive: boolean;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdBy: { id: string; name: string };
  createdAt: string;
  usageCount: number;
}

interface ExternalEndpoint {
  id: string;
  path: string;
  name: string;
  description: string | null;
  methods: string[];
  supportsClientScope: boolean;
  supportsMissionScope: boolean;
  isEnabled: boolean;
}

interface NewKeyResponse {
  id: string;
  name: string;
  apiKey: string;
  keyPrefix: string;
  role: string;
  allowedEndpoints: string[];
  expiresAt: string | null;
  createdAt: string;
}

interface ApiRequestMetrics {
  date: string;
  totalCalls: number;
  failedCalls: number;
  topEndpoints: Array<{
    provider: string;
    endpoint: string;
    method: string;
    count: number;
  }>;
  failedRequests: Array<{
    provider: string;
    endpoint: string;
    method: string;
    statusCode: number;
    count: number;
  }>;
}

export default function ApiManagementPage() {
  const toast = useToast();
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [endpoints, setEndpoints] = useState<ExternalEndpoint[]>([]);
  const [apiMetrics, setApiMetrics] = useState<ApiRequestMetrics | null>(null);
  const [clients, setClients] = useState<Array<{ id: string; name: string }>>([]);
  const [missions, setMissions] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newKeyData, setNewKeyData] = useState<NewKeyResponse | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "revoked">("all");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    role: "MANAGER",
    clientId: "",
    missionId: "",
    selectedEndpoints: [] as string[],
    rateLimitPerMinute: 60,
    rateLimitPerHour: 3600,
    expiresAt: "",
  });

  // Filtered keys
  const filteredKeys = useMemo(() => {
    return apiKeys.filter(key => {
      const matchesSearch = key.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           key.keyPrefix.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = filterStatus === "all" || 
                           (filterStatus === "active" && key.isActive) ||
                           (filterStatus === "revoked" && !key.isActive);
      return matchesSearch && matchesStatus;
    });
  }, [apiKeys, searchQuery, filterStatus]);

  // Stats
  const stats = useMemo(() => {
    const total = apiKeys.length;
    const active = apiKeys.filter(k => k.isActive).length;
    const totalRequests = apiKeys.reduce((sum, k) => sum + k.usageCount, 0);
    const recentlyUsed = apiKeys.filter(k => {
      if (!k.lastUsedAt) return false;
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      return new Date(k.lastUsedAt) > dayAgo;
    }).length;
    return { total, active, totalRequests, recentlyUsed };
  }, [apiKeys]);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (copiedKey) {
      const timer = setTimeout(() => setCopiedKey(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [copiedKey]);

  async function loadData() {
    try {
      setLoading(true);
      const [keysRes, endpointsRes, metricsRes, clientsRes, missionsRes] = await Promise.all([
        fetch("/api/manager/api-keys"),
        fetch("/api/manager/api-keys/endpoints"),
        fetch("/api/manager/api-keys/metrics"),
        fetch("/api/manager/clients"),
        fetch("/api/manager/missions"),
      ]);

      if (keysRes.ok) {
        const keysData = await keysRes.json();
        setApiKeys(keysData.data || []);
      }
      if (endpointsRes.ok) {
        const endpointsData = await endpointsRes.json();
        setEndpoints(endpointsData.data || []);
      }
      if (metricsRes.ok) {
        const metricsData = await metricsRes.json();
        setApiMetrics(metricsData.data || null);
      }
      if (clientsRes.ok) {
        const clientsData = await clientsRes.json();
        setClients(clientsData.data || []);
      }
      if (missionsRes.ok) {
        const missionsData = await missionsRes.json();
        setMissions(missionsData.data || []);
      }
    } catch (error) {
      toast.error("Failed to load API data");
    } finally {
      setLoading(false);
    }
  }

  async function createApiKey() {
    if (!formData.name.trim()) {
      toast.error("Please enter a key name");
      return;
    }
    if (formData.selectedEndpoints.length === 0) {
      toast.error("Please select at least one endpoint");
      return;
    }
    if (formData.rateLimitPerMinute * 60 > formData.rateLimitPerHour) {
      toast.error("Rate limit per hour must be at least per-minute × 60");
      return;
    }

    try {
      setCreating(true);
      const res = await fetch("/api/manager/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name.trim(),
          role: formData.role,
          clientId: formData.clientId || null,
          missionId: formData.missionId || null,
          allowedEndpoints: formData.selectedEndpoints,
          rateLimitPerMinute: formData.rateLimitPerMinute,
          rateLimitPerHour: formData.rateLimitPerHour,
          expiresAt: formData.expiresAt || null,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setNewKeyData(data.data);
        setShowCreateDialog(false);
        // Reset form
        setFormData({
          name: "",
          role: "MANAGER",
          clientId: "",
          missionId: "",
          selectedEndpoints: [],
          rateLimitPerMinute: 60,
          rateLimitPerHour: 3600,
          expiresAt: "",
        });
        loadData();
        toast.success("API key created successfully");
      } else {
        const error = await res.json();
        toast.error(error.error || "Failed to create API key");
      }
    } catch (error) {
      toast.error("Failed to create API key");
    } finally {
      setCreating(false);
    }
  }

  async function revokeKey(id: string) {
    if (!confirm("Are you sure you want to revoke this API key? This action cannot be undone.")) return;

    try {
      const res = await fetch(`/api/manager/api-keys/${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        toast.success("API key revoked successfully");
        loadData();
      } else {
        toast.error("Failed to revoke API key");
      }
    } catch (error) {
      toast.error("Failed to revoke API key");
    }
  }

  function copyToClipboard(text: string, label: string = "text") {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(text);
      toast.success(`${label} copied to clipboard`);
    }).catch(() => {
      toast.error("Failed to copy to clipboard");
    });
  }

  function formatDate(date: string | null) {
    if (!date) return "Never";
    return new Date(date).toLocaleString();
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <div className="p-2 bg-primary-100 rounded-lg">
                <Key className="w-6 h-6 text-primary-600" />
              </div>
              API Management
            </h1>
            <p className="text-gray-500 mt-2">
              Secure API keys for external integrations with role-based access control
            </p>
          </div>
          <Button 
            onClick={() => setShowCreateDialog(true)}
            className="bg-primary-600 hover:bg-primary-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create API Key
          </Button>
        </div>

        {/* Stats Cards */}
        {!loading && (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 font-medium">Total Keys</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{stats.total}</p>
                  </div>
                  <div className="p-3 bg-blue-100 rounded-lg">
                    <Key className="w-5 h-5 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 font-medium">External API Calls Today</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">
                      {(apiMetrics?.totalCalls || 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="p-3 bg-cyan-100 rounded-lg">
                    <Activity className="w-5 h-5 text-cyan-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 font-medium">Active Keys</p>
                    <p className="text-2xl font-bold text-green-600 mt-1">{stats.active}</p>
                  </div>
                  <div className="p-3 bg-green-100 rounded-lg">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 font-medium">Total Requests</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">
                      {stats.totalRequests.toLocaleString()}
                    </p>
                  </div>
                  <div className="p-3 bg-accent-100 rounded-lg">
                    <TrendingUp className="w-5 h-5 text-accent-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 font-medium">Used Today</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{stats.recentlyUsed}</p>
                  </div>
                  <div className="p-3 bg-amber-100 rounded-lg">
                    <Zap className="w-5 h-5 text-amber-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {!loading && apiMetrics && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <Card>
              <CardHeader className="mb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-cyan-600" />
                  Top External Endpoints Today
                </CardTitle>
              </CardHeader>
              <CardContent>
                {apiMetrics.topEndpoints.length > 0 ? (
                  <div className="space-y-3">
                    {apiMetrics.topEndpoints.map((item) => (
                      <div key={`${item.method}-${item.endpoint}`} className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            <span className="text-cyan-700">{item.provider}</span> {item.method} {item.endpoint}
                          </p>
                        </div>
                        <span className="text-sm font-semibold text-gray-900 shrink-0">
                          {item.count.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No external API calls recorded today.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="mb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  Failed External Requests Today
                </CardTitle>
              </CardHeader>
              <CardContent>
                {apiMetrics.failedRequests.length > 0 ? (
                  <div className="space-y-3">
                    {apiMetrics.failedRequests.map((item) => (
                      <div key={`${item.method}-${item.endpoint}-${item.statusCode}`} className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            <span className="text-amber-700">{item.statusCode}</span> {item.provider} {item.method} {item.endpoint}
                          </p>
                        </div>
                        <span className="text-sm font-semibold text-gray-900 shrink-0">
                          {item.count.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No failed external API calls recorded today.</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Search and Filter Bar */}
        {!loading && apiKeys.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search by name or key prefix..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select
              options={[
                { value: 'all', label: 'All Keys' },
                { value: 'active', label: 'Active Only' },
                { value: 'revoked', label: 'Revoked Only' },
              ]}
              value={filterStatus}
              onChange={(value) => setFilterStatus(value as "all" | "active" | "revoked")}
            />
            <Button
              variant="outline"
              onClick={loadData}
              className="flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </Button>
          </div>
        )}
      </div>

      {/* Create API Key Dialog */}
      {showCreateDialog && (
        <Modal
          isOpen={showCreateDialog}
          onClose={() => setShowCreateDialog(false)}
          title="Create New API Key"
          description="Create an API key for external access to the CRM. The key will only be shown once."
          size="xl"
          className="max-h-[90vh]"
        >
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-900">Key Name *</label>
              <Input
                placeholder="e.g., OpenClaw Integration"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-900">Role Permission *</label>
              <Select
                options={[
                  { value: 'MANAGER', label: 'Manager (Full Access)' },
                  { value: 'SDR', label: 'SDR (Limited Access)' },
                  { value: 'CLIENT', label: 'Client (Client-scoped)' },
                  { value: 'DEVELOPER', label: 'Developer (Full Access)' },
                ]}
                value={formData.role}
                onChange={(value) => setFormData({ ...formData, role: value })}
              />
              <p className="text-xs text-gray-500">
                This determines the data access level for this API key
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-900">Scope to Client (Optional)</label>
                <Select
                  options={[
                    { value: '', label: 'All clients' },
                    ...clients.map(c => ({ value: c.id, label: c.name }))
                  ]}
                  value={formData.clientId}
                  onChange={(value) => setFormData({ ...formData, clientId: value })}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-900">Scope to Mission (Optional)</label>
                <Select
                  options={[
                    { value: '', label: 'All missions' },
                    ...missions.map(m => ({ value: m.id, label: m.name }))
                  ]}
                  value={formData.missionId}
                  onChange={(value) => setFormData({ ...formData, missionId: value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-900">Allowed Endpoints *</label>
              <div className="border border-gray-200 rounded-lg p-4 space-y-3 max-h-64 overflow-y-auto bg-gray-50">
                {endpoints.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">No endpoints available</p>
                ) : (
                  endpoints.map((endpoint) => (
                    <label
                      key={endpoint.id}
                      className="flex items-start space-x-3 p-3 rounded-lg hover:bg-white border border-transparent hover:border-gray-200 cursor-pointer transition-all"
                    >
                      <input
                        type="checkbox"
                        checked={formData.selectedEndpoints.includes(endpoint.path)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormData({
                              ...formData,
                              selectedEndpoints: [...formData.selectedEndpoints, endpoint.path],
                            });
                          } else {
                            setFormData({
                              ...formData,
                              selectedEndpoints: formData.selectedEndpoints.filter(
                                (p) => p !== endpoint.path
                              ),
                            });
                          }
                        }}
                        className="mt-1 h-4 w-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-gray-900">{endpoint.name}</p>
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-200 text-gray-700">
                            {endpoint.methods.join(", ")}
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 mt-0.5">{endpoint.path}</p>
                        {endpoint.description && (
                          <p className="text-xs text-gray-500 mt-1">{endpoint.description}</p>
                        )}
                      </div>
                    </label>
                  ))
                )}
              </div>
              {formData.selectedEndpoints.length > 0 && (
                <p className="text-xs text-gray-600">
                  {formData.selectedEndpoints.length} endpoint{formData.selectedEndpoints.length !== 1 ? 's' : ''} selected
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-900">Rate Limit (per minute)</label>
                <Input
                  type="number"
                  min={1}
                  max={1000}
                  value={formData.rateLimitPerMinute}
                  onChange={(e) => {
                    const minute = parseInt(e.target.value) || 60;
                    const minHour = minute * 60;
                    setFormData({
                      ...formData,
                      rateLimitPerMinute: minute,
                      rateLimitPerHour: Math.max(formData.rateLimitPerHour, minHour),
                    });
                  }}
                />
                <p className="text-xs text-gray-500">Maximum requests per minute (1-1000)</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-900">Rate Limit (per hour)</label>
                <Input
                  type="number"
                  min={formData.rateLimitPerMinute * 60}
                  max={10000}
                  value={formData.rateLimitPerHour}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      rateLimitPerHour: Math.max(
                        formData.rateLimitPerMinute * 60,
                        parseInt(e.target.value) || 3600
                      ),
                    })
                  }
                />
                <p className="text-xs text-gray-500">
                  Maximum requests per hour ({formData.rateLimitPerMinute * 60}-10000)
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-900">Expiration Date (Optional)</label>
              <Input
                type="datetime-local"
                value={formData.expiresAt}
                onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
              />
              <p className="text-xs text-gray-500">Leave empty for no expiration</p>
            </div>
          </div>

          <ModalFooter className="mt-6">
            <Button 
              variant="outline" 
              onClick={() => setShowCreateDialog(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button
              onClick={createApiKey}
              disabled={
                creating ||
                !formData.name.trim() ||
                formData.selectedEndpoints.length === 0
              }
              className="bg-primary-600 hover:bg-primary-700 text-white"
            >
              {creating ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  Create API Key
                </>
              )}
            </Button>
          </ModalFooter>
        </Modal>
      )}

      {/* New Key Display Dialog */}
      {newKeyData && (
        <Modal
          isOpen={!!newKeyData}
          onClose={() => setNewKeyData(null)}
          title="Save Your API Key"
          size="lg"
          closeOnOverlay={false}
          closeOnEscape={false}
        >
          <div className="space-y-6">
            <div className="bg-amber-50 border-2 border-amber-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-900">
                    This is the ONLY time you will see this key!
                  </p>
                  <p className="text-sm text-amber-800 mt-1">
                    Copy it now and store it securely. You won&apos;t be able to retrieve it again.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-sm font-medium text-gray-900">Your API Key</label>
              <div className="relative">
                <code className="block bg-gray-900 text-green-400 px-4 py-4 rounded-lg font-mono text-sm break-all border-2 border-gray-700">
                  {newKeyData.apiKey}
                </code>
                <Button
                  variant="outline"
                  onClick={() => copyToClipboard(newKeyData.apiKey, "API Key")}
                  className="absolute top-2 right-2 bg-white hover:bg-gray-100"
                >
                  {copiedKey === newKeyData.apiKey ? (
                    <>
                      <CheckCircle className="w-4 h-4 mr-2 text-green-600" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 mr-2" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Name</p>
                <p className="text-sm font-medium text-gray-900 mt-1">{newKeyData.name}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Role</p>
                <p className="text-sm font-medium text-gray-900 mt-1">{newKeyData.role}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Endpoints</p>
                <p className="text-sm font-medium text-gray-900 mt-1">
                  {newKeyData.allowedEndpoints.length} selected
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Created</p>
                <p className="text-sm font-medium text-gray-900 mt-1">
                  {formatDate(newKeyData.createdAt)}
                </p>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-900">
                  <p className="font-medium">Next Steps:</p>
                  <ul className="mt-2 space-y-1 list-disc list-inside">
                    <li>Store this key in a secure password manager</li>
                    <li>Add it to your application&apos;s environment variables</li>
                    <li>Never commit it to version control</li>
                    <li>Use it in the X-API-Key header for requests</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <ModalFooter className="mt-6">
            <Button 
              onClick={() => setNewKeyData(null)} 
              className="bg-primary-600 hover:bg-primary-700 text-white w-full sm:w-auto"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              I&apos;ve Saved the Key
            </Button>
          </ModalFooter>
        </Modal>
      )}

      {/* API Keys List */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="w-8 h-8 animate-spin text-primary-400" />
          <p className="ml-3 text-gray-500">Loading API keys...</p>
        </div>
      ) : apiKeys.length === 0 ? (
        <Card className="text-center py-16">
          <CardContent>
            <div className="p-4 bg-gray-100 rounded-full w-20 h-20 mx-auto mb-4 flex items-center justify-center">
              <Key className="w-10 h-10 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No API Keys Yet</h3>
            <p className="text-gray-500 mb-6 max-w-md mx-auto">
              Create your first API key to enable external integrations and start accessing your CRM data programmatically
            </p>
            <Button onClick={() => setShowCreateDialog(true)} className="bg-primary-600 hover:bg-primary-700">
              <Plus className="w-4 h-4 mr-2" />
              Create Your First API Key
            </Button>
          </CardContent>
        </Card>
      ) : filteredKeys.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <Search className="w-12 h-12 mx-auto text-gray-300 mb-3" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No keys found</h3>
            <p className="text-gray-500 mb-4">
              Try adjusting your search or filter criteria
            </p>
            <Button 
              variant="outline" 
              onClick={() => {
                setSearchQuery("");
                setFilterStatus("all");
              }}
            >
              Clear Filters
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredKeys.map((key) => (
            <Card key={key.id} className={!key.isActive ? "opacity-60" : ""}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <div className={`p-2 rounded-lg ${key.isActive ? "bg-primary-100" : "bg-gray-100"}`}>
                      <Key className={`w-5 h-5 ${key.isActive ? "text-primary-600" : "text-gray-500"}`} />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{key.name}</CardTitle>
                      <p className="text-sm text-gray-500 flex items-center space-x-2 mt-1">
                        <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                          {key.keyPrefix}••••••••
                        </code>
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                    key.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {key.isActive ? 'Active' : 'Revoked'}
                  </span>
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                    key.role === "admin" ? 'bg-primary-100 text-primary-800' : 'bg-gray-100 text-gray-800'
                  }`}>
                    {key.role}
                  </span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {key.isActive && (
                      <Button
                        variant="outline"
                        onClick={() => revokeKey(key.id)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4 mr-1" />
                        Revoke
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      onClick={() => setExpandedKey(expandedKey === key.id ? null : key.id)}
                    >
                      {expandedKey === key.id ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </CardHeader>

              {expandedKey === key.id && (
                <CardContent className="border-t pt-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Created</p>
                      <p className="text-sm font-medium">{formatDate(key.createdAt)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Last Used</p>
                      <p className="text-sm font-medium">{formatDate(key.lastUsedAt)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Total Requests</p>
                      <p className="text-sm font-medium">{key.usageCount.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Expires</p>
                      <p className="text-sm font-medium">
                        {key.expiresAt ? formatDate(key.expiresAt) : "Never"}
                      </p>
                    </div>
                  </div>

                  {key.client && (
                    <div className="mb-3">
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Client Scope</p>
                      <p className="text-sm font-medium">{key.client.name}</p>
                    </div>
                  )}

                  {key.mission && (
                    <div className="mb-3">
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Mission Scope</p>
                      <p className="text-sm font-medium">{key.mission.name}</p>
                    </div>
                  )}

                  <div className="mb-3">
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Allowed Endpoints</p>
                    <div className="flex flex-wrap gap-2">
                      {key.allowedEndpoints.map((endpoint) => (
                        <span key={endpoint} className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border">
                          {endpoint}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Rate Limit (min)</p>
                      <p className="text-sm font-medium">{key.rateLimitPerMinute} requests</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Rate Limit (hour)</p>
                      <p className="text-sm font-medium">{key.rateLimitPerHour} requests</p>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t">
                    <p className="text-xs text-gray-500 mb-2">Created by: {key.createdBy.name}</p>
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Documentation Card */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="flex items-center">
            <Shield className="w-5 h-5 mr-2" />
            API Documentation
          </CardTitle>
          <p className="text-sm text-gray-600">
            How to use the API keys with external integrations
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-medium mb-2">Authentication</h4>
            <p className="text-sm text-gray-600 mb-2">
              Include your API key in the header of each request:
            </p>
            <code className="block bg-gray-900 text-gray-100 p-3 rounded text-sm font-mono">
              X-API-Key: your-api-key-here
            </code>
            <p className="text-sm text-gray-600 mt-2">
              Or use Bearer token format:
            </p>
            <code className="block bg-gray-900 text-gray-100 p-3 rounded text-sm font-mono">
              Authorization: Bearer your-api-key-here
            </code>
          </div>

          <div>
            <h4 className="font-medium mb-2">Available Endpoints</h4>
            <div className="space-y-2">
              {endpoints.filter(e => e.isEnabled).map((endpoint) => (
                <div key={endpoint.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                  <div>
                    <p className="font-medium text-sm">{endpoint.name}</p>
                    <code className="text-xs text-gray-600">{endpoint.path}</code>
                  </div>
                  <div className="flex items-center space-x-2">
                    {endpoint.methods.map((method) => (
                      <span key={method} className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border">
                        {method}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h4 className="font-medium mb-2">Example Request</h4>
            <code className="block bg-gray-900 text-gray-100 p-3 rounded text-sm font-mono whitespace-pre">
{`curl -H "X-API-Key: cp_live_xxxxxxxxxxxxx" \\
  "https://yourdomain.com/api/stats?period=month"`}
            </code>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

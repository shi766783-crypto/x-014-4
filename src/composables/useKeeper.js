import { computed, reactive } from 'vue'
import { createStorage } from '../services/storage'
import { config, seed } from '../data'

const storage = createStorage(config.storageKey, seed)
export function useKeeper() {
  const state = reactive(storage.read())
  const persist = () => storage.write(state)

  // 保单 ↔ 合同档案关联：通过 linkedPolicyId / linkedDocumentId 互查；旧数据没有这两个字段，保持独立
  const linkedPolicy = (doc) => state.policies.find((entry) => entry.id === doc?.linkedPolicyId)
  const linkedDocument = (policy) => state.documents.find((entry) => entry.id === policy?.linkedDocumentId)

  const add = (collection, item) => { state[collection].unshift({ id: `${collection}-${Date.now()}`, createdAt: new Date().toISOString(), ...item }); persist() }
  // 只有 expires 会沿关联同步到另一端，双方其余展示字段各自维护、互不覆盖
  const update = (collection, id, patch) => {
    const item = state[collection].find((entry) => entry.id === id)
    if (item) {
      Object.assign(item, patch)
      if ('expires' in patch) {
        const peer = collection === 'documents' ? linkedPolicy(item) : collection === 'policies' ? linkedDocument(item) : null
        if (peer) peer.expires = item.expires
      }
    }
    persist()
  }
  const remove = (collection, id) => {
    if (collection === 'documents') unlinkByDocument(id)
    if (collection === 'policies') unlinkByPolicy(id)
    state[collection] = state[collection].filter((entry) => entry.id !== id)
    persist()
  }
  // 建立一对一关联：先解除双方各自已有的关联，再对齐到期时间（取较晚日期，视为续保后的最新状态）
  const link = (documentId, policyId) => {
    const doc = state.documents.find((entry) => entry.id === documentId)
    const policy = state.policies.find((entry) => entry.id === policyId)
    if (!doc || !policy) return
    unlinkByDocument(documentId)
    unlinkByPolicy(policyId)
    doc.linkedPolicyId = policy.id
    policy.linkedDocumentId = doc.id
    const latest = [doc.expires, policy.expires].filter(Boolean).sort().pop()
    if (latest) { doc.expires = latest; policy.expires = latest }
    persist()
  }
  const unlinkByDocument = (documentId) => {
    const doc = state.documents.find((entry) => entry.id === documentId)
    const policy = linkedPolicy(doc)
    if (policy) policy.linkedDocumentId = ''
    if (doc) doc.linkedPolicyId = ''
    persist()
  }
  const unlinkByPolicy = (policyId) => {
    const policy = state.policies.find((entry) => entry.id === policyId)
    const doc = linkedDocument(policy)
    if (doc) doc.linkedPolicyId = ''
    if (policy) policy.linkedDocumentId = ''
    persist()
  }
  const reset = () => { Object.assign(state, structuredClone(seed)); persist() }
  const metrics = computed(() => config.metrics.map((metric) => ({ ...metric, value: metric.value ? metric.value(state) : state[metric.collection]?.length || 0 })))
  return { state, add, update, remove, reset, persist, metrics, link, unlinkByDocument, unlinkByPolicy, linkedPolicy, linkedDocument }
}

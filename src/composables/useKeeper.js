import { computed, reactive } from 'vue'
import { createStorage } from '../services/storage'
import { config, seed } from '../data'

const storage = createStorage(config.storageKey, seed)
export function useKeeper() {
  const state = reactive(storage.read())
  const persist = () => storage.write(state)
  const add = (collection, item) => { state[collection].unshift({ id: `${collection}-${Date.now()}`, createdAt: new Date().toISOString(), ...item }); persist() }
  // 保单与合同档案建立关联后，到期时间在一处维护，另一端随 update 自动同步；只同步 expires，双方其余展示信息互不影响
  const syncLinkedExpiry = (collection, id, expires) => {
    if (collection === 'policies') {
      const policy = state.policies.find((entry) => entry.id === id)
      const doc = state.documents.find((entry) => entry.id === policy?.linkedDocumentId)
      if (doc) doc.expires = expires
    }
    if (collection === 'documents') state.policies.filter((entry) => entry.linkedDocumentId === id).forEach((entry) => { entry.expires = expires })
  }
  const update = (collection, id, patch) => { const item = state[collection].find((entry) => entry.id === id); if (item) Object.assign(item, patch); if (item && patch.expires) syncLinkedExpiry(collection, id, patch.expires); persist() }
  // 关联是可选的：不传 documentId 即解除关联，未关联的保单与档案照常各自独立维护
  const setPolicyLink = (policyId, documentId) => { const policy = state.policies.find((entry) => entry.id === policyId); if (policy) policy.linkedDocumentId = documentId || null; persist() }
  const remove = (collection, id) => { state[collection] = state[collection].filter((entry) => entry.id !== id); if (collection === 'documents') state.policies.forEach((entry) => { if (entry.linkedDocumentId === id) entry.linkedDocumentId = null }); persist() }
  const reset = () => { Object.assign(state, structuredClone(seed)); persist() }
  const metrics = computed(() => config.metrics.map((metric) => ({ ...metric, value: metric.value ? metric.value(state) : state[metric.collection]?.length || 0 })))
  return { state, add, update, remove, reset, persist, metrics, setPolicyLink }
}

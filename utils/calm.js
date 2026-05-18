import NodeClam from 'clamscan'

let clamInstance = null

const initClam = async () => {
  if (clamInstance) return clamInstance

  const clamscan = new NodeClam()
  clamInstance = await clamscan.init({
    removeInfected: false,
    quarantineInfected: false,
    scanLog: null,
    debugMode: false,
    clamdscan: {
      socket: '/run/clamav/clamd.ctl', // ✅ use socket
      timeout: 60000,
    },
  })

  return clamInstance
}
export default initClam

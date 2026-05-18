import NodeClam from 'clamscan'

const run = async () => {
  const clam = await new NodeClam().init({
    clamdscan: {
      socket: '/run/clamav/clamd.ctl',
      timeout: 60000,
    },
  })

  const pong = await clam.ping()
  console.log('ClamAV ping:', pong)
}

run().catch(console.error)

// portalhandler.tsx

/*
    The infinite list scroller stores user cell data in a central hidden portal cache for each
    infinitegridscroller root, from whence the data is pulled into the relevant CellFrame for display
*/

import React, {useState, useEffect, useRef} from 'react'
import ReactDOM from 'react-dom'

import { createHtmlPortalNode, InPortal } from 'react-reverse-portal'

const MAX_CACHE_OVER_RUN = 1.5

// global scroller data, organized by session scrollerID
export class CacheHandler {

    constructor(scrollerID) {
        this.scrollerProps.scrollerID = scrollerID
    }

    //===========================[ REPOSITORY AND LIST MANAGEMENT ]==================================

    scrollerProps = {
        setListState:null,
        modified:false,
        portalMetadataMap:new Map(),
        portalRequestedMap: new Map(), // some portals may have been requested by requestidlecallback, not yet created
        portalMap:new Map(),
        portalList:null,
        scrollerID:null
    }

    // initialize scroller repository

    clearCache = () => {

        // keep the setListState callback
        this.scrollerProps.portalMap.clear() 
        this.scrollerProps.portalMetadataMap.clear()
        this.scrollerProps.portalList = null
        this.scrollerProps.modified = false

        this.scrollerProps.setListState() // trigger display update

    }

    // set state of the PortalList component of the scroller to trigger render
    renderPortalList = () => {

        if (this.scrollerProps.modified) {
            this.scrollerProps.portalList = Array.from(this.scrollerProps.portalMap.values())
            this.scrollerProps.modified = false
        }

        this.scrollerProps.setListState() // trigger display update

    }

    matchCacheToCradle = (modelIndexList) => {
        // console.log('running matchCacheToCradle', '-'+this.scrollerProps.scrollerID+'-')
        const mapkeys = Array.from(this.scrollerProps.portalMap.keys())
        mapkeys.filter(key => !modelIndexList.includes(key))
        // console.log('filtered mapkeys, modelIndexList', mapkeys, modelIndexList)
        this.deletePortal(mapkeys)
    }

    pareCacheToMax = (cacheMax, modelIndexList) => {

        const modelLength = modelIndexList.length

        // determine need for paring
        if ((!cacheMax) || (!modelLength)) return false

        const max = Math.max(modelLength, cacheMax)

        const portalMapList = this.scrollerProps.portalMap
        const requestedMap = this.scrollerProps.portalRequestedMap

        if ((portalMapList.size + requestedMap.size) <= max) return false

        // sort the map keys
        const mapkeyslist = Array.from(portalMapList.keys())
        const requestedkeys = Array.from(requestedMap.keys())

        const mapkeys = mapkeyslist.concat(requestedkeys)

        mapkeys.sort((a,b) => a - b)

        // get number to pare
        const mapLength = mapkeys.length
        const parecount = mapLength - max

        // distribute paring proportionally at front and back
        const headindex = modelIndexList[0]
        const tailindex = modelIndexList[modelLength - 1]
        const headpos = mapkeys.indexOf(headindex)
        const tailpos = mapkeys.indexOf(tailindex)

        const headroom = headpos
        const tailroom = mapLength - (tailpos + 1)
        const pareroom = headroom + tailroom

        const headparecount = Math.floor((headroom/pareroom)*parecount)
        const tailparecount = parecount - headparecount

        // collect indexes to pare
        const headlist = mapkeys.slice(0,headparecount)
        const taillist = mapkeys.slice(mapLength - tailparecount)

        const delList = headlist.concat(taillist)

        this.deletePortal(delList)

        return true

    }

    guardAgainstRunawayCaching = (cacheMax, modelLength) => {

        if (!cacheMax) return false

        const portalMap = this.scrollerProps.portalMap
        const portalRequestedMap = this.scrollerProps.portalRequestedMap

        const max = Math.max(modelLength, cacheMax)

        if ((portalMap.size + portalRequestedMap.size) <= ((max) * MAX_CACHE_OVER_RUN)) {
            return false
        } else {
            return true
        }

    }

    async preloadItem(index, getItem, cradlePassthroughPropertiesRef, scrollerID) {

        const usercontent = await getItem(index)

        if (usercontent) {

            // console.log('preloading index','-'+scrollerID+'-' ,index )

            let content 
            const scrollerData = {
                isReparentingRef:null,
                cradlePassthroughPropertiesRef,
            }
            if (usercontent.props.hasOwnProperty('scrollerData')) {
                content = React.cloneElement(usercontent, {scrollerData})
            } else {
                content = usercontent
            }

            const portalData = 
                this.createPortal(index, content)
            // make available to user content
            scrollerData.isReparentingRef = portalData.isReparentingRef

        } else {

            console.log('ERROR','no content item for preload index',index)

        }

    }

    preload(cradleParameters,callback, scrollerID) {

        const { cradlePassthroughPropertiesRef } = cradleParameters
        const { stateHandler } = cradleParameters.handlersRef.current

        const cradleInheritedProperties = cradleParameters.cradleInheritedPropertiesRef.current
        const { getItem } = cradleInheritedProperties
        const { listsize } = cradleInheritedProperties

        const promises = []

        if (stateHandler.isMountedRef.current) {

            for (let i = 0; i < listsize; i++) {
                // console.log('preloading',i)
                const promise = this.preloadItem(i, getItem, cradlePassthroughPropertiesRef, scrollerID)
                promises.push(promise)
            }
        }

        Promise.all(promises).then(
            ()=>{
                // console.log("finished preloading",'-'+scrollerID+'-',+this.scrollerProps.portalMap.size)
                callback()
            }
        )

    }

    // ==========================[ INDIVIDUAL PORTAL MANAGEMENT ]============================

    registerRequestedPortal(index) {
        this.scrollerProps.portalRequestedMap.set(index, null)
    }

    removeRequestedPortal(index) {
        this.scrollerProps.portalRequestedMap.delete(index)
    }

    createPortal(index, content) { // create new portal

        this.removeRequestedPortal(index)

        // console.log('creating portal for index','-'+this.scrollerProps.scrollerID+'-', index)
        const portalNode = createPortalNode(index)

        this.scrollerProps.portalMap.set(index,
                <InPortal key = {index} node = {portalNode} > { content } </InPortal>)
        this.scrollerProps.modified = true

        const portalMetadata = {
            portalNode,
            isReparentingRef:{
                current:false,
            }
        }

        this.scrollerProps.portalMetadataMap.set(index, portalMetadata)

        this.renderPortalList()

        return portalMetadata

    }

    // delete a portal list item
    // accepts an array of indexes
    deletePortal(index) {

        let indexArray
        if (!Array.isArray(index)) {
            indexArray = [index]
        } else {
            indexArray = index
        }

        for (let i of indexArray) {
            this.scrollerProps.portalMetadataMap.delete(i)
            this.scrollerProps.portalMap.delete(i)
        }
        this.scrollerProps.modified = true

    }

    // query existence of a portal list item
    hasPortal(index) {

        return this.scrollerProps.portalMetadataMap.has(index)

    }

    getPortal(index) {

        if (this.hasPortal(index)) {
            return this.scrollerProps.portalMetadataMap.get(index)
        }

    }

}

// ==========================[ Utility functions ]============================

// get a react-reverse-portal InPortal component, with its metadata
// with user content and container
const createPortalNode = (index) => {

    let portalNode = createHtmlPortalNode()

    let container = portalNode.element
    container.style.inset = '0px' 
    container.style.position = 'absolute'
    // container.style.height = '100%'
    // container.style.width = '100%'
    container.dataset.type = 'contentenvelope'
    container.dataset.index = index

    return portalNode

}     

// ========================[ Utility components ]==============================

// portal list component for rapid relisting of updates, using external callback for set state
export const PortalList = ({ scrollerProps }) => {

    // console.log('running PORTALLIST', '-'+scrollerProps.scrollerID+'-')

    const [portalList, setPortalList] = useState(null)
    const isMountedRef = useRef(true)

    useEffect(()=>{

        scrollerProps.setListState = ()=>{

            isMountedRef.current && setPortalList(scrollerProps.portalList)

        }

        return () => {isMountedRef.current = false}

    },[]) 

    return portalList
}
